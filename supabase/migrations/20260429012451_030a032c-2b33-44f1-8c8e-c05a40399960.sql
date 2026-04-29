
-- Enhance the existing burst trigger to also detect credential stuffing & distributed brute-force.
CREATE OR REPLACE FUNCTION public.notify_admins_failed_login_burst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _staff_count integer;
  _ip_count integer;
  _distinct_staff_for_ip integer;
  _distinct_ips_for_staff integer;
  _recent_window interval := interval '60 seconds';
  _wide_window interval := interval '5 minutes';
  _notify_threshold integer := 5;
  _stuffing_threshold integer := 3;        -- 3+ different staff IDs from same IP
  _distributed_threshold integer := 3;     -- 3+ different IPs targeting same staff ID
  _admin_id uuid;
  _title text;
  _message text;
  _last_alert timestamptz;
BEGIN
  -- Burst: same staff_id (existing behaviour)
  SELECT COUNT(*) INTO _staff_count
  FROM public.failed_login_attempts
  WHERE staff_id = NEW.staff_id
    AND attempted_at > (now() - _recent_window);

  IF NEW.ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO _ip_count
    FROM public.failed_login_attempts
    WHERE ip_address = NEW.ip_address
      AND attempted_at > (now() - _recent_window);
  ELSE
    _ip_count := 0;
  END IF;

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
    _message := format('IP "%s" produced %s failed login attempts in the last 60 seconds (latest staff ID: %s).',
      NEW.ip_address, _ip_count, NEW.staff_id);
    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (_admin_id, _title, _message, 'general');
    END LOOP;
  END IF;

  -- Pattern 1: Credential stuffing — one IP hitting many staff IDs in 5 min
  IF NEW.ip_address IS NOT NULL THEN
    SELECT COUNT(DISTINCT staff_id) INTO _distinct_staff_for_ip
    FROM public.failed_login_attempts
    WHERE ip_address = NEW.ip_address
      AND attempted_at > (now() - _wide_window);

    IF _distinct_staff_for_ip = _stuffing_threshold THEN
      -- Throttle: ensure we haven't alerted on this IP in the past 10 minutes
      SELECT MAX(created_at) INTO _last_alert
      FROM public.notifications
      WHERE title = 'Suspicious Pattern — Credential Stuffing'
        AND message LIKE '%' || NEW.ip_address || '%'
        AND created_at > now() - interval '10 minutes';

      IF _last_alert IS NULL THEN
        _title := 'Suspicious Pattern — Credential Stuffing';
        _message := format('IP "%s" attempted %s different staff IDs in the last 5 minutes. Possible credential-stuffing attack.',
          NEW.ip_address, _distinct_staff_for_ip);
        FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
          INSERT INTO public.notifications (user_id, title, message, type)
          VALUES (_admin_id, _title, _message, 'general');
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- Pattern 2: Distributed brute-force — one staff ID hit from many IPs in 5 min
  SELECT COUNT(DISTINCT ip_address) INTO _distinct_ips_for_staff
  FROM public.failed_login_attempts
  WHERE staff_id = NEW.staff_id
    AND ip_address IS NOT NULL
    AND attempted_at > (now() - _wide_window);

  IF _distinct_ips_for_staff = _distributed_threshold THEN
    SELECT MAX(created_at) INTO _last_alert
    FROM public.notifications
    WHERE title = 'Suspicious Pattern — Distributed Attack'
      AND message LIKE '%' || NEW.staff_id || '%'
      AND created_at > now() - interval '10 minutes';

    IF _last_alert IS NULL THEN
      _title := 'Suspicious Pattern — Distributed Attack';
      _message := format('Staff ID "%s" was attempted from %s different IP addresses in the last 5 minutes. Possible distributed brute-force.',
        NEW.staff_id, _distinct_ips_for_staff);
      FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (_admin_id, _title, _message, 'general');
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_failed_login_burst failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Live security threats summary for the admin dashboard widget
CREATE OR REPLACE FUNCTION public.get_security_threat_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _last_hour_count integer;
  _last_5min_count integer;
  _top_staff jsonb;
  _top_ips jsonb;
  _stuffing jsonb;
  _distributed jsonb;
  _locked_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can view security threat summary';
  END IF;

  SELECT COUNT(*) INTO _last_hour_count
  FROM public.failed_login_attempts
  WHERE attempted_at > now() - interval '1 hour';

  SELECT COUNT(*) INTO _last_5min_count
  FROM public.failed_login_attempts
  WHERE attempted_at > now() - interval '5 minutes';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_staff
  FROM (
    SELECT staff_id, COUNT(*)::int AS attempts, MAX(attempted_at) AS last_attempt
    FROM public.failed_login_attempts
    WHERE attempted_at > now() - interval '1 hour'
    GROUP BY staff_id
    ORDER BY attempts DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_ips
  FROM (
    SELECT ip_address, COUNT(*)::int AS attempts, COUNT(DISTINCT staff_id)::int AS distinct_staff, MAX(attempted_at) AS last_attempt
    FROM public.failed_login_attempts
    WHERE attempted_at > now() - interval '1 hour'
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    ORDER BY attempts DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _stuffing
  FROM (
    SELECT ip_address, COUNT(DISTINCT staff_id)::int AS distinct_staff, COUNT(*)::int AS attempts
    FROM public.failed_login_attempts
    WHERE attempted_at > now() - interval '5 minutes'
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    HAVING COUNT(DISTINCT staff_id) >= 3
    ORDER BY distinct_staff DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _distributed
  FROM (
    SELECT staff_id, COUNT(DISTINCT ip_address)::int AS distinct_ips, COUNT(*)::int AS attempts
    FROM public.failed_login_attempts
    WHERE attempted_at > now() - interval '5 minutes'
      AND ip_address IS NOT NULL
    GROUP BY staff_id
    HAVING COUNT(DISTINCT ip_address) >= 3
    ORDER BY distinct_ips DESC
    LIMIT 5
  ) t;

  SELECT COUNT(*) INTO _locked_count
  FROM public.profiles WHERE account_locked = true;

  _result := jsonb_build_object(
    'last_hour_attempts', _last_hour_count,
    'last_5min_attempts', _last_5min_count,
    'locked_accounts', _locked_count,
    'top_targeted_staff', _top_staff,
    'top_attacking_ips', _top_ips,
    'credential_stuffing', _stuffing,
    'distributed_attacks', _distributed,
    'generated_at', now()
  );

  RETURN _result;
END;
$$;

-- Make failed_login_attempts publish for realtime so admins get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.failed_login_attempts;
