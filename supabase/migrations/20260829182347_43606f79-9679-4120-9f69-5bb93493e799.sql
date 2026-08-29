CREATE OR REPLACE FUNCTION public.biometric_reminder_run(_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.biometric_reminder_settings;
  _required boolean;
  _grace int;
  _enforced timestamptz;
  _roles public.app_role[];
  _deadline timestamptz;
  _days_left int;
  _is_admin boolean := public.has_role(auth.uid(), 'admin');
  _emails jsonb := '[]'::jsonb;
  _rec record;
  _kind text;
  _subject text;
  _body text;
  _log_id uuid;
  _in_app int := 0;
  _queued int := 0;
  _considered int := 0;
BEGIN
  IF NOT (_is_admin OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not authorised to run biometric reminders.';
  END IF;

  SELECT * INTO _s FROM public.biometric_reminder_settings ORDER BY created_at LIMIT 1;
  IF _s.id IS NULL THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'no settings row');
  END IF;

  IF NOT _s.enabled AND NOT _force THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'reminders disabled');
  END IF;

  IF _s.paused_reason IS NOT NULL AND NOT _force THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'paused', 'detail', _s.paused_reason);
  END IF;

  UPDATE public.biometric_reminder_settings
     SET lease_until = now() + interval '10 minutes'
   WHERE id = _s.id
     AND (lease_until IS NULL OR lease_until < now());
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'another run in progress');
  END IF;

  IF NOT _force AND EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int <> _s.send_hour_utc THEN
    UPDATE public.biometric_reminder_settings SET lease_until = NULL WHERE id = _s.id;
    RETURN jsonb_build_object('ran', false, 'reason', 'outside send hour',
                              'send_hour_utc', _s.send_hour_utc);
  END IF;

  SELECT COALESCE(a.biometric_enrollment_required, false) AND COALESCE(a.biometric_login_enabled, true),
         GREATEST(COALESCE(a.biometric_enrollment_grace_days, 15), 0),
         COALESCE(a.biometric_enrollment_enforced_at, now()),
         COALESCE(a.biometric_required_roles, '{}'::public.app_role[])
    INTO _required, _grace, _enforced, _roles
    FROM public.app_settings a LIMIT 1;

  IF NOT COALESCE(_required, false) THEN
    UPDATE public.biometric_reminder_settings
       SET lease_until = NULL, last_run_at = now(),
           last_run_summary = jsonb_build_object('ran', false, 'reason', 'enrollment not required')
     WHERE id = _s.id;
    RETURN jsonb_build_object('ran', false, 'reason', 'enrollment policy not active');
  END IF;

  _deadline := _enforced + make_interval(days => _grace);
  _days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_deadline - now())) / 86400.0))::int;
  _kind := CASE WHEN now() > _deadline THEN 'overdue' ELSE 'grace' END;

  IF _kind = 'grace' AND _days_left > _s.grace_lead_days THEN
    UPDATE public.biometric_reminder_settings SET lease_until = NULL WHERE id = _s.id;
    RETURN jsonb_build_object('ran', false, 'reason', 'outside reminder lead window',
                              'days_left', _days_left);
  END IF;

  FOR _rec IN
    SELECT p.user_id,
           NULLIF(BTRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS full_name,
           p.email, p.staff_id
      FROM public.profiles p
     WHERE p.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = p.user_id AND ur.role = ANY (_roles))
       AND NOT EXISTS (SELECT 1 FROM public.webauthn_credentials c
                        WHERE c.user_id = p.user_id AND c.revoked_at IS NULL)
       AND NOT EXISTS (
             SELECT 1 FROM public.biometric_reminder_log l
              WHERE l.user_id = p.user_id
                AND l.kind = _kind
                AND l.status IN ('queued', 'sent')
                AND l.created_at > now() - make_interval(days => CASE
                      WHEN _kind = 'overdue' THEN _s.overdue_interval_days
                      ELSE _s.grace_interval_days END))
     ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST
     LIMIT _s.batch_size
  LOOP
    _considered := _considered + 1;

    _subject := CASE WHEN _kind = 'overdue' THEN _s.overdue_subject ELSE _s.grace_subject END;
    _body := CASE WHEN _kind = 'overdue' THEN _s.overdue_body ELSE _s.grace_body END;

    _subject := replace(replace(replace(_subject,
        '{{name}}', COALESCE(_rec.full_name, 'colleague')),
        '{{days_left}}', _days_left::text),
        '{{deadline}}', to_char(_deadline, 'DD/MM/YYYY'));
    _body := replace(replace(replace(replace(_body,
        '{{name}}', COALESCE(_rec.full_name, 'colleague')),
        '{{days_left}}', _days_left::text),
        '{{deadline}}', to_char(_deadline, 'DD/MM/YYYY')),
        '{{staff_id}}', COALESCE(_rec.staff_id, ''));

    IF _s.notify_in_app THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (_rec.user_id, _subject, _body,
              CASE WHEN _kind = 'overdue' THEN 'biometric_overdue' ELSE 'biometric_reminder' END);

      INSERT INTO public.biometric_reminder_log
        (user_id, kind, channel, subject, status, days_left, deadline)
      VALUES (_rec.user_id, _kind, 'in_app', _subject, 'sent', _days_left, _deadline);
      _in_app := _in_app + 1;
    END IF;

    IF _s.notify_email AND COALESCE(_rec.email, '') <> '' THEN
      INSERT INTO public.biometric_reminder_log
        (user_id, kind, channel, subject, status, days_left, deadline)
      VALUES (_rec.user_id, _kind, 'email', _subject, 'queued', _days_left, _deadline)
      RETURNING id INTO _log_id;

      _emails := _emails || jsonb_build_object(
        'log_id', _log_id,
        'user_id', _rec.user_id,
        'to', _rec.email,
        'subject', _subject,
        'body', _body);
      _queued := _queued + 1;
    END IF;
  END LOOP;

  UPDATE public.biometric_reminder_settings
     SET lease_until = NULL,
         last_run_at = now(),
         last_run_summary = jsonb_build_object(
           'kind', _kind, 'considered', _considered,
           'in_app', _in_app, 'emails_queued', _queued,
           'days_left', _days_left, 'deadline', _deadline)
   WHERE id = _s.id;

  RETURN jsonb_build_object('ran', true, 'kind', _kind, 'considered', _considered,
                            'in_app', _in_app, 'emails_queued', _queued,
                            'days_left', _days_left, 'deadline', _deadline,
                            'emails', _emails);
END;
$$;

REVOKE ALL ON FUNCTION public.biometric_reminder_run(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.biometric_reminder_run(boolean) TO authenticated, service_role;