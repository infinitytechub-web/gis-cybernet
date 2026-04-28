-- Update record_failed_login to accept optional IP address
CREATE OR REPLACE FUNCTION public.record_failed_login(_staff_id text, _ip_address text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _recent_count integer;
  _is_locked boolean;
BEGIN
  INSERT INTO public.failed_login_attempts (staff_id, ip_address) VALUES (_staff_id, _ip_address);

  SELECT COUNT(*) INTO _recent_count
  FROM public.failed_login_attempts
  WHERE staff_id = _staff_id
    AND attempted_at > (now() - interval '60 seconds');

  _is_locked := _recent_count >= 5;

  RETURN jsonb_build_object(
    'attempts', _recent_count,
    'locked', _is_locked,
    'remaining', GREATEST(0, 5 - _recent_count)
  );
END;
$function$;

-- Trigger function: notify admins on suspicious failed login bursts
CREATE OR REPLACE FUNCTION public.notify_admins_failed_login_burst()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _staff_count integer;
  _ip_count integer;
  _recent_window interval := interval '60 seconds';
  _notify_threshold integer := 5;
  _last_alert_for_staff timestamptz;
  _last_alert_for_ip timestamptz;
  _admin_id uuid;
  _title text;
  _message text;
BEGIN
  -- Count attempts for this staff_id in the window
  SELECT COUNT(*) INTO _staff_count
  FROM public.failed_login_attempts
  WHERE staff_id = NEW.staff_id
    AND attempted_at > (now() - _recent_window);

  -- Count attempts from this IP in the window (across any staff_id)
  IF NEW.ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO _ip_count
    FROM public.failed_login_attempts
    WHERE ip_address = NEW.ip_address
      AND attempted_at > (now() - _recent_window);
  ELSE
    _ip_count := 0;
  END IF;

  -- Avoid spamming: only alert when crossing threshold (exact match)
  IF _staff_count = _notify_threshold THEN
    _title := 'Repeated Failed Logins — Staff ID';
    _message := format('Staff ID "%s" has %s failed login attempts in the last 60 seconds%s.',
      NEW.staff_id, _staff_count,
      CASE WHEN NEW.ip_address IS NOT NULL THEN ' (latest IP: ' || NEW.ip_address || ')' ELSE '' END);

    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (_admin_id, _title, _message, 'general');
    END LOOP;
  END IF;

  IF NEW.ip_address IS NOT NULL AND _ip_count = _notify_threshold THEN
    _title := 'Repeated Failed Logins — IP Address';
    _message := format('IP address "%s" produced %s failed login attempts in the last 60 seconds (latest staff ID: %s).',
      NEW.ip_address, _ip_count, NEW.staff_id);

    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (_admin_id, _title, _message, 'general');
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_failed_login_burst failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_admins_failed_login_burst ON public.failed_login_attempts;
CREATE TRIGGER trg_notify_admins_failed_login_burst
AFTER INSERT ON public.failed_login_attempts
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_failed_login_burst();