-- 1. Archive table for cleaned-up trusted devices
CREATE TABLE IF NOT EXISTS public.mfa_trusted_devices_archive (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  fingerprint_hash text NOT NULL,
  label text,
  user_agent text,
  ip text,
  trusted_hours integer,
  created_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mfa_trusted_devices_archive TO authenticated;
GRANT ALL ON public.mfa_trusted_devices_archive TO service_role;

ALTER TABLE public.mfa_trusted_devices_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command tier can view archived trusted devices" ON public.mfa_trusted_devices_archive;
CREATE POLICY "Command tier can view archived trusted devices"
ON public.mfa_trusted_devices_archive FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR user_id = auth.uid()
);

-- 2. Allow the purge routine (and only it) to delete rows
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
    IF current_setting('app.trusted_device_purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Trusted device records cannot be deleted — revoke them instead';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Bulk revoke: one reason per selected device
CREATE OR REPLACE FUNCTION public.mfa_revoke_trusted_devices_bulk(_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_reason text;
  v_owner uuid;
  v_is_command boolean;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'No devices selected';
  END IF;
  IF jsonb_array_length(_items) > 200 THEN
    RAISE EXCEPTION 'Select at most 200 devices at a time';
  END IF;

  v_is_command := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic');

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_id := NULLIF(v_item ->> 'device_id', '')::uuid;
    v_reason := NULLIF(trim(COALESCE(v_item ->> 'reason', '')), '');

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Each item requires a device_id';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 5 THEN
      RAISE EXCEPTION 'A reason of at least 5 characters is required for every selected device';
    END IF;

    SELECT user_id INTO v_owner FROM public.mfa_trusted_devices WHERE id = v_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Trusted device not found';
    END IF;
    IF v_owner <> auth.uid() AND NOT v_is_command THEN
      RAISE EXCEPTION 'Not authorised to revoke one or more of the selected devices';
    END IF;

    UPDATE public.mfa_trusted_devices
       SET revoked_at = now(),
           revoked_by = auth.uid(),
           revoke_reason = v_reason
     WHERE id = v_id AND revoked_at IS NULL;

    IF FOUND THEN
      v_count := v_count + 1;
      PERFORM public.log_security_event(
        'mfa', 'trusted_device_revoked', 'high', v_owner::text,
        jsonb_build_object('device_id', v_id, 'reason', v_reason,
                           'bulk', true, 'by_admin', v_owner <> auth.uid()),
        NULL, NULL
      );
    END IF;
  END LOOP;

  PERFORM public.log_security_event(
    'mfa', 'trusted_devices_bulk_revoked', 'high', auth.uid()::text,
    jsonb_build_object('revoked', v_count, 'selected', jsonb_array_length(_items)),
    NULL, NULL
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_revoke_trusted_devices_bulk(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_revoke_trusted_devices_bulk(jsonb) TO authenticated;

-- 4. Self-service listing of the caller's own remembered devices
CREATE OR REPLACE FUNCTION public.mfa_my_trusted_devices(_include_revoked boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  label text,
  user_agent text,
  trusted_hours integer,
  created_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  revoked_by_self boolean,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT d.id, d.label, d.user_agent, d.trusted_hours, d.created_at, d.expires_at,
         d.last_used_at, d.revoked_at, d.revoke_reason,
         (d.revoked_by = d.user_id) AS revoked_by_self,
         (d.revoked_at IS NULL AND d.expires_at > now()) AS is_active
    FROM public.mfa_trusted_devices d
   WHERE d.user_id = auth.uid()
     AND (_include_revoked OR d.revoked_at IS NULL)
   ORDER BY d.created_at DESC
   LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_my_trusted_devices(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_my_trusted_devices(boolean) TO authenticated;

-- 5. Scheduled cleanup: close out expired grants, archive old records, audit it
CREATE OR REPLACE FUNCTION public.mfa_purge_expired_trusted_devices(_archive_after_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(_archive_after_days, 90), 7), 730);
  v_closed integer := 0;
  v_archived integer := 0;
  v_by_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only administrators can run the trusted device cleanup';
    END IF;
    v_by_admin := true;
  END IF;

  -- Expired but never revoked: mark them closed so they show a final state
  UPDATE public.mfa_trusted_devices
     SET revoked_at = now(),
         revoke_reason = 'Automatically closed — trust window expired'
   WHERE revoked_at IS NULL
     AND expires_at <= now();
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Archive and purge anything revoked longer ago than the retention window
  PERFORM set_config('app.trusted_device_purge', 'on', true);

  WITH moved AS (
    DELETE FROM public.mfa_trusted_devices d
     WHERE d.revoked_at IS NOT NULL
       AND d.revoked_at < now() - make_interval(days => v_days)
    RETURNING d.*
  )
  INSERT INTO public.mfa_trusted_devices_archive (
    id, user_id, fingerprint_hash, label, user_agent, ip, trusted_hours,
    created_at, expires_at, last_used_at, revoked_at, revoked_by, revoke_reason
  )
  SELECT m.id, m.user_id, m.fingerprint_hash, m.label, m.user_agent, m.ip, m.trusted_hours,
         m.created_at, m.expires_at, m.last_used_at, m.revoked_at, m.revoked_by, m.revoke_reason
    FROM moved m;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  PERFORM set_config('app.trusted_device_purge', 'off', true);

  PERFORM public.log_security_event(
    'mfa', 'trusted_devices_cleanup', 'info',
    COALESCE(auth.uid()::text, 'system'),
    jsonb_build_object('expired_closed', v_closed, 'archived', v_archived,
                       'retention_days', v_days, 'manual', v_by_admin),
    NULL, NULL
  );

  RETURN jsonb_build_object('expired_closed', v_closed, 'archived', v_archived, 'retention_days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_purge_expired_trusted_devices(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mfa_purge_expired_trusted_devices(integer) TO authenticated;

-- Nightly at 02:15 UTC
SELECT cron.unschedule('mfa-trusted-device-cleanup')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mfa-trusted-device-cleanup');

SELECT cron.schedule(
  'mfa-trusted-device-cleanup',
  '15 2 * * *',
  $$SELECT public.mfa_purge_expired_trusted_devices(90);$$
);