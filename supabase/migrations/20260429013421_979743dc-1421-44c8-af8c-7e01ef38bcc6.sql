-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.ip_block_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid REFERENCES public.ip_blocks(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('blocked','unblocked')),
  ip_address text,
  device_fingerprint text,
  reason text,
  duration_minutes integer,
  blocked_until timestamptz,
  performed_by uuid,
  performed_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_block_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ip block audit"
  ON public.ip_block_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT policy: only SECURITY DEFINER functions can write.

-- 2. Forced signout queue (one row per fingerprint/IP that must be signed out)
CREATE TABLE IF NOT EXISTS public.forced_signouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text,
  device_fingerprint text,
  block_id uuid REFERENCES public.ip_blocks(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_forced_signouts_ip ON public.forced_signouts(ip_address);
CREATE INDEX IF NOT EXISTS idx_forced_signouts_fp ON public.forced_signouts(device_fingerprint);

ALTER TABLE public.forced_signouts ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may check if their device matches (for self sign-out).
CREATE POLICY "Authenticated can read forced signouts"
  ON public.forced_signouts FOR SELECT TO authenticated
  USING (true);

-- 3. Replace block_ip with auditing + forced signout queue
CREATE OR REPLACE FUNCTION public.block_ip(
  _ip text,
  _fingerprint text DEFAULT NULL,
  _duration_minutes integer DEFAULT 60,
  _reason text DEFAULT 'Repeated failed login attempts',
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
  _until timestamptz;
  _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can block IP addresses';
  END IF;
  IF _ip IS NULL OR length(btrim(_ip)) = 0 THEN
    RAISE EXCEPTION 'IP address is required';
  END IF;

  _until := CASE WHEN _duration_minutes IS NULL OR _duration_minutes <= 0
                 THEN NULL
                 ELSE now() + make_interval(mins => _duration_minutes) END;

  INSERT INTO public.ip_blocks (ip_address, device_fingerprint, reason, blocked_by, blocked_until, notes, active)
  VALUES (_ip, NULLIF(btrim(_fingerprint),''), COALESCE(_reason,'Repeated failed login attempts'), auth.uid(), _until, _notes, true)
  RETURNING id INTO _id;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.ip_block_audit
    (block_id, action, ip_address, device_fingerprint, reason, duration_minutes, blocked_until, performed_by, performed_by_name, notes)
  VALUES
    (_id, 'blocked', _ip, NULLIF(btrim(_fingerprint),''), COALESCE(_reason,'Repeated failed login attempts'),
     _duration_minutes, _until, auth.uid(), NULLIF(trim(_name),''), _notes);

  -- Queue forced sign-out for active sessions matching this IP/fingerprint
  INSERT INTO public.forced_signouts (ip_address, device_fingerprint, block_id, reason, expires_at)
  VALUES (_ip, NULLIF(btrim(_fingerprint),''), _id, COALESCE(_reason,'Blocked by administrator'),
          COALESCE(_until, now() + interval '24 hours'));

  RETURN _id;
END;
$$;

-- 4. Replace unblock_ip with auditing
CREATE OR REPLACE FUNCTION public.unblock_ip(_block_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.ip_blocks%ROWTYPE;
  _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can unblock IP addresses';
  END IF;

  SELECT * INTO _row FROM public.ip_blocks WHERE id = _block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block not found';
  END IF;

  UPDATE public.ip_blocks
     SET active = false,
         unblocked_by = auth.uid(),
         unblocked_at = now()
   WHERE id = _block_id;

  -- Remove forced-signout entries so the same device can sign in again
  DELETE FROM public.forced_signouts WHERE block_id = _block_id;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.ip_block_audit
    (block_id, action, ip_address, device_fingerprint, reason, blocked_until, performed_by, performed_by_name)
  VALUES
    (_block_id, 'unblocked', _row.ip_address, _row.device_fingerprint, _row.reason, _row.blocked_until,
     auth.uid(), NULLIF(trim(_name),''));
END;
$$;

-- 5. Client-side check: should this device/IP be signed out right now?
CREATE OR REPLACE FUNCTION public.should_force_signout(_ip text, _fingerprint text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.forced_signouts
    WHERE expires_at > now()
      AND (
        (ip_address = _ip)
        OR (_fingerprint IS NOT NULL AND device_fingerprint = _fingerprint)
      )
  );
$$;

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.forced_signouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ip_block_audit;