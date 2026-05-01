
-- Lower lockout threshold from 5 to 3 attempts and persist the lock on the profile
CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text, _ip_address text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _recent_count integer;
  _is_locked boolean;
  _threshold constant integer := 3;
BEGIN
  INSERT INTO public.failed_login_attempts (staff_id, ip_address)
  VALUES (_staff_id, _ip_address);

  SELECT COUNT(*) INTO _recent_count
  FROM public.failed_login_attempts
  WHERE staff_id = _staff_id
    AND attempted_at > (now() - interval '15 minutes');

  _is_locked := _recent_count >= _threshold;

  -- Persist the lock on the profile so it survives the 15-min window
  -- and requires an administrator to unlock.
  IF _is_locked THEN
    BEGIN
      UPDATE public.profiles
         SET account_locked = true,
             login_enabled  = false
       WHERE staff_id = _staff_id
         AND account_locked IS DISTINCT FROM true;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not persist account_locked for %: %', _staff_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'attempts',  _recent_count,
    'locked',    _is_locked,
    'remaining', GREATEST(0, _threshold - _recent_count),
    'threshold', _threshold
  );
END;
$function$;

-- Match the live-lock window in is_staff_locked
CREATE OR REPLACE FUNCTION public.is_staff_locked(_staff_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT COUNT(*) FROM public.failed_login_attempts
       WHERE staff_id = _staff_id
         AND attempted_at > (now() - interval '15 minutes')) >= 3
  ) OR (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE staff_id = _staff_id AND account_locked = true)
  );
$$;
