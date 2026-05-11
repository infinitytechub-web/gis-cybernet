-- Add MAC address support to IP/Device blocking
ALTER TABLE public.ip_blocks ADD COLUMN IF NOT EXISTS mac_address text;
ALTER TABLE public.ip_block_audit ADD COLUMN IF NOT EXISTS mac_address text;

-- Normalize MAC: uppercase, accept ':', '-', '.' separators or none; validate 12 hex chars
CREATE OR REPLACE FUNCTION public.normalize_mac(_mac text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _clean text;
BEGIN
  IF _mac IS NULL OR length(btrim(_mac)) = 0 THEN RETURN NULL; END IF;
  _clean := upper(regexp_replace(_mac, '[^0-9A-Fa-f]', '', 'g'));
  IF length(_clean) <> 12 THEN
    RAISE EXCEPTION 'Invalid MAC address: %', _mac;
  END IF;
  RETURN regexp_replace(_clean, '(..)(..)(..)(..)(..)(..)', E'\\1:\\2:\\3:\\4:\\5:\\6');
END;
$$;

-- Replace block_ip to accept _mac
CREATE OR REPLACE FUNCTION public.block_ip(
  _ip text,
  _fingerprint text DEFAULT NULL::text,
  _duration_minutes integer DEFAULT 60,
  _reason text DEFAULT 'Repeated failed login attempts'::text,
  _notes text DEFAULT NULL::text,
  _mac text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _until timestamptz;
  _name text;
  _mac_norm text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can block IP addresses';
  END IF;
  IF _ip IS NULL OR length(btrim(_ip)) = 0 THEN
    RAISE EXCEPTION 'IP address is required';
  END IF;

  _mac_norm := public.normalize_mac(_mac);

  _until := CASE WHEN _duration_minutes IS NULL OR _duration_minutes <= 0
                 THEN NULL
                 ELSE now() + make_interval(mins => _duration_minutes) END;

  INSERT INTO public.ip_blocks (ip_address, device_fingerprint, mac_address, reason, blocked_by, blocked_until, notes, active)
  VALUES (_ip, NULLIF(btrim(_fingerprint),''), _mac_norm, COALESCE(_reason,'Repeated failed login attempts'), auth.uid(), _until, _notes, true)
  RETURNING id INTO _id;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.ip_block_audit
    (block_id, action, ip_address, device_fingerprint, mac_address, reason, duration_minutes, blocked_until, performed_by, performed_by_name, notes)
  VALUES
    (_id, 'blocked', _ip, NULLIF(btrim(_fingerprint),''), _mac_norm, COALESCE(_reason,'Repeated failed login attempts'),
     _duration_minutes, _until, auth.uid(), NULLIF(trim(_name),''), _notes);

  INSERT INTO public.forced_signouts (ip_address, device_fingerprint, block_id, reason, expires_at)
  VALUES (_ip, NULLIF(btrim(_fingerprint),''), _id, COALESCE(_reason,'Blocked by administrator'),
          COALESCE(_until, now() + interval '24 hours'));

  RETURN _id;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_ip_blocks_mac ON public.ip_blocks (mac_address) WHERE mac_address IS NOT NULL;