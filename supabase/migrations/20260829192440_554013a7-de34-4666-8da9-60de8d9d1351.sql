CREATE TABLE public.mfa_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fingerprint_hash text NOT NULL,
  label text,
  user_agent text,
  ip text,
  trusted_hours integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);

CREATE INDEX idx_mfa_trusted_devices_user ON public.mfa_trusted_devices(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_mfa_trusted_devices_active
  ON public.mfa_trusted_devices(user_id, fingerprint_hash)
  WHERE revoked_at IS NULL;

GRANT SELECT ON public.mfa_trusted_devices TO authenticated;
GRANT ALL ON public.mfa_trusted_devices TO service_role;

ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trusted devices"
ON public.mfa_trusted_devices FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Command tier can view all trusted devices"
ON public.mfa_trusted_devices FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
);

CREATE TRIGGER mfa_trusted_devices_updated_at
BEFORE UPDATE ON public.mfa_trusted_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Direct writes are blocked; all mutations go through the RPCs below.
CREATE OR REPLACE FUNCTION public.block_mfa_trusted_device_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Trusted device records cannot be deleted — revoke them instead';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER mfa_trusted_devices_no_delete
BEFORE DELETE ON public.mfa_trusted_devices
FOR EACH ROW EXECUTE FUNCTION public.block_mfa_trusted_device_mutation();

-- Register (or refresh) a remembered device for the caller. Requires AAL2.
CREATE OR REPLACE FUNCTION public.mfa_register_trusted_device(
  _fingerprint_hash text,
  _hours integer DEFAULT 12,
  _label text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer := LEAST(GREATEST(COALESCE(_hours, 12), 1), 24);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'A verified 2FA session (AAL2) is required to remember this device';
  END IF;
  IF _fingerprint_hash IS NULL OR length(_fingerprint_hash) < 16 THEN
    RAISE EXCEPTION 'Invalid device fingerprint';
  END IF;

  UPDATE public.mfa_trusted_devices
     SET revoked_at = now(), revoke_reason = 'Replaced by a new trust grant'
   WHERE user_id = auth.uid()
     AND fingerprint_hash = _fingerprint_hash
     AND revoked_at IS NULL;

  INSERT INTO public.mfa_trusted_devices (
    user_id, fingerprint_hash, label, user_agent, trusted_hours, expires_at
  ) VALUES (
    auth.uid(), _fingerprint_hash, NULLIF(_label, ''), left(COALESCE(_user_agent, ''), 240),
    v_hours, now() + make_interval(hours => v_hours)
  )
  RETURNING id INTO v_id;

  PERFORM public.log_security_event(
    'mfa', 'trusted_device_registered', 'warn', auth.uid()::text,
    jsonb_build_object('device_id', v_id, 'trusted_hours', v_hours),
    NULL, left(COALESCE(_user_agent, ''), 240)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_register_trusted_device(text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_register_trusted_device(text, integer, text, text) TO authenticated;

-- Is this device still trusted for the caller? Touches last_used_at.
CREATE OR REPLACE FUNCTION public.mfa_trusted_device_check(_fingerprint_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL OR _fingerprint_hash IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.mfa_trusted_devices
     SET last_used_at = now()
   WHERE user_id = auth.uid()
     AND fingerprint_hash = _fingerprint_hash
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING expires_at INTO v_expires;

  RETURN v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_trusted_device_check(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_trusted_device_check(text) TO authenticated;

-- Revoke: owner, or admin / OIC / 2IC. Reason required for admin action.
CREATE OR REPLACE FUNCTION public.mfa_revoke_trusted_device(_device_id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_is_command boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_command := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic');

  SELECT user_id INTO v_owner FROM public.mfa_trusted_devices WHERE id = _device_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Trusted device not found';
  END IF;

  IF v_owner <> auth.uid() AND NOT v_is_command THEN
    RAISE EXCEPTION 'Not authorised to revoke this device';
  END IF;

  IF v_owner <> auth.uid() AND (_reason IS NULL OR length(trim(_reason)) < 5) THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  UPDATE public.mfa_trusted_devices
     SET revoked_at = now(),
         revoked_by = auth.uid(),
         revoke_reason = NULLIF(trim(COALESCE(_reason, '')), '')
   WHERE id = _device_id AND revoked_at IS NULL;

  PERFORM public.log_security_event(
    'mfa', 'trusted_device_revoked', 'high', v_owner::text,
    jsonb_build_object('device_id', _device_id, 'reason', NULLIF(trim(COALESCE(_reason, '')), ''),
                       'by_admin', v_owner <> auth.uid()),
    NULL, NULL
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_revoke_trusted_device(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_revoke_trusted_device(uuid, text) TO authenticated;

-- Revoke every active device for one staff member (command tier only).
CREATE OR REPLACE FUNCTION public.mfa_revoke_all_trusted_devices(_user_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR _user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _user_id <> auth.uid() AND (_reason IS NULL OR length(trim(_reason)) < 5) THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  UPDATE public.mfa_trusted_devices
     SET revoked_at = now(),
         revoked_by = auth.uid(),
         revoke_reason = NULLIF(trim(COALESCE(_reason, '')), '')
   WHERE user_id = _user_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_security_event(
    'mfa', 'trusted_devices_bulk_revoked', 'high', _user_id::text,
    jsonb_build_object('revoked', v_count, 'reason', NULLIF(trim(COALESCE(_reason, '')), '')),
    NULL, NULL
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_revoke_all_trusted_devices(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_revoke_all_trusted_devices(uuid, text) TO authenticated;

-- Admin/OIC/2IC listing with staff details.
CREATE OR REPLACE FUNCTION public.mfa_trusted_devices_feed(
  _user_id uuid DEFAULT NULL,
  _include_revoked boolean DEFAULT false,
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  staff_name text,
  staff_identifier text,
  label text,
  user_agent text,
  trusted_hours integer,
  created_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by_name text,
  revoke_reason text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
  ) THEN
    RAISE EXCEPTION 'Not authorised to view trusted devices';
  END IF;

  RETURN QUERY
  SELECT d.id,
         d.user_id,
         CONCAT_WS(' ', p.first_name, p.last_name) AS staff_name,
         p.staff_identifier,
         d.label,
         d.user_agent,
         d.trusted_hours,
         d.created_at,
         d.expires_at,
         d.last_used_at,
         d.revoked_at,
         CONCAT_WS(' ', rb.first_name, rb.last_name) AS revoked_by_name,
         d.revoke_reason,
         (d.revoked_at IS NULL AND d.expires_at > now()) AS is_active
    FROM public.mfa_trusted_devices d
    LEFT JOIN public.profiles p ON p.id = d.user_id
    LEFT JOIN public.profiles rb ON rb.id = d.revoked_by
   WHERE (_user_id IS NULL OR d.user_id = _user_id)
     AND (_include_revoked OR d.revoked_at IS NULL)
   ORDER BY d.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_trusted_devices_feed(uuid, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_trusted_devices_feed(uuid, boolean, integer) TO authenticated;
