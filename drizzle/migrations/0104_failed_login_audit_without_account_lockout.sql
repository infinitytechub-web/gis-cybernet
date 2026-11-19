CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text, _ip_address text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_recent integer;
BEGIN
  IF _staff_id IS NULL OR length(btrim(_staff_id)) NOT BETWEEN 2 AND 64 THEN
    RAISE EXCEPTION 'Invalid staff identifier';
  END IF;
  INSERT INTO public.failed_login_attempts (staff_id, ip_address)
  VALUES (_staff_id, left(_ip_address, 128));
  SELECT COUNT(*) INTO v_recent FROM public.failed_login_attempts
  WHERE staff_id = _staff_id AND attempted_at > now() - interval '15 minutes';
  -- Untrusted failures are audit evidence, never authority to disable an account.
  RETURN jsonb_build_object('attempts', v_recent, 'locked', false, 'remaining', NULL);
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_staff_locked(_staff_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Failure counters must neither create nor expire administrator-set locks.
  SELECT COALESCE((SELECT account_locked FROM public.profiles WHERE staff_id = _staff_id), false);
$function$;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO service_role;
COMMENT ON FUNCTION public.record_failed_login(text, text) IS 'Audit-only untrusted sign-in failures; does not alter profile access or create account locks.';