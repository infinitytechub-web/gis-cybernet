CREATE OR REPLACE FUNCTION public.is_ip_blocked(
  _ip text,
  _fingerprint text DEFAULT NULL::text,
  _mac text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _mac_norm text := NULL;
BEGIN
  -- Normalize the incoming MAC if any. Invalid MACs are treated as "no MAC"
  -- rather than raising — block evaluation must never throw inside the auth
  -- pre-flight.
  IF _mac IS NOT NULL AND length(btrim(_mac)) > 0 THEN
    BEGIN
      _mac_norm := public.normalize_mac(_mac);
    EXCEPTION WHEN OTHERS THEN
      _mac_norm := NULL;
    END;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.ip_blocks
    WHERE active = true
      AND (blocked_until IS NULL OR blocked_until > now())
      AND (
        (ip_address = _ip)
        OR (_fingerprint IS NOT NULL AND device_fingerprint = _fingerprint)
        OR (_mac_norm IS NOT NULL AND mac_address = _mac_norm)
      )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text, text, text) TO authenticated, anon;