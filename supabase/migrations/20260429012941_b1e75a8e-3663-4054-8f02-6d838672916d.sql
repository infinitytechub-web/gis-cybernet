-- IP/Device block list
CREATE TABLE IF NOT EXISTS public.ip_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  device_fingerprint text,
  reason text NOT NULL DEFAULT 'Repeated failed login attempts',
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  unblocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  unblocked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_ip ON public.ip_blocks(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocks_fp ON public.ip_blocks(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ip_blocks_active ON public.ip_blocks(active, blocked_until);

ALTER TABLE public.ip_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ip blocks"
  ON public.ip_blocks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ip blocks"
  ON public.ip_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ip blocks"
  ON public.ip_blocks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ip blocks"
  ON public.ip_blocks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ip_blocks_updated_at
  BEFORE UPDATE ON public.ip_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public check: is an IP/fingerprint currently blocked?
CREATE OR REPLACE FUNCTION public.is_ip_blocked(_ip text, _fingerprint text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_blocks
    WHERE active = true
      AND (blocked_until IS NULL OR blocked_until > now())
      AND (
        (ip_address = _ip)
        OR (_fingerprint IS NOT NULL AND device_fingerprint = _fingerprint)
      )
  );
$$;

-- Admin: block an IP (and optionally a device fingerprint)
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

  RETURN _id;
END;
$$;

-- Admin: unblock immediately
CREATE OR REPLACE FUNCTION public.unblock_ip(_block_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can unblock IP addresses';
  END IF;
  UPDATE public.ip_blocks
     SET active = false,
         unblocked_by = auth.uid(),
         unblocked_at = now()
   WHERE id = _block_id;
END;
$$;

-- Auto-deactivate expired blocks helper (callable from UI refresh)
CREATE OR REPLACE FUNCTION public.expire_ip_blocks()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.ip_blocks
     SET active = false
   WHERE active = true
     AND blocked_until IS NOT NULL
     AND blocked_until <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;