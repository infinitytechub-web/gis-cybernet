ALTER TABLE public.webauthn_audit DROP CONSTRAINT IF EXISTS webauthn_audit_event_check;
ALTER TABLE public.webauthn_audit ADD CONSTRAINT webauthn_audit_event_check CHECK (event IN (
  'enroll', 'authenticate_success', 'authenticate_failure',
  'revoke', 'settings_change', 'stepup_success', 'stepup_failure',
  'enroll_attempt', 'enroll_failure', 'status_change', 'policy_change'
));

-- Self-service logging of enrollment attempts, failures and compliance status changes.
CREATE OR REPLACE FUNCTION public.webauthn_log_enrollment_event(
  _event text,
  _detail text DEFAULT NULL,
  _device_label text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF _event NOT IN ('enroll_attempt', 'enroll_failure', 'status_change') THEN
    RAISE EXCEPTION 'Unsupported biometric audit event.';
  END IF;

  IF _event = 'status_change' THEN
    SELECT detail INTO _last
      FROM public.webauthn_audit
     WHERE user_id = auth.uid() AND event = 'status_change'
     ORDER BY created_at DESC
     LIMIT 1;
    IF _last IS NOT NULL AND _last = _detail THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.webauthn_audit (event, user_id, device_label, detail, actor_id)
  VALUES (_event, auth.uid(), left(COALESCE(_device_label, ''), 120), left(COALESCE(_detail, ''), 500), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_log_enrollment_event(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_log_enrollment_event(text, text, text) TO authenticated, service_role;

-- Policy updates are now logged as an explicit policy_change with before/after values.
CREATE OR REPLACE FUNCTION public.webauthn_admin_set_enrollment_policy(
  _required boolean,
  _grace_days integer,
  _roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _was boolean;
  _was_grace integer;
  _was_roles public.app_role[];
  _role_enum public.app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may change the biometric enrollment policy.';
  END IF;

  IF _grace_days IS NULL OR _grace_days < 0 OR _grace_days > 365 THEN
    RAISE EXCEPTION 'Grace period must be between 0 and 365 days.';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x::public.app_role FROM unnest(COALESCE(_roles, '{}'::text[])) AS x)
    INTO _role_enum;

  SELECT COALESCE(biometric_enrollment_required, false),
         COALESCE(biometric_enrollment_grace_days, 0),
         COALESCE(biometric_required_roles, '{}'::public.app_role[])
    INTO _was, _was_grace, _was_roles
    FROM public.app_settings LIMIT 1;

  UPDATE public.app_settings
     SET biometric_enrollment_required = COALESCE(_required, false),
         biometric_enrollment_grace_days = _grace_days,
         biometric_required_roles = _role_enum,
         biometric_enrollment_enforced_at = CASE
           WHEN COALESCE(_required, false) AND NOT COALESCE(_was, false) THEN now()
           WHEN NOT COALESCE(_required, false) THEN NULL
           ELSE biometric_enrollment_enforced_at
         END
   WHERE id = (SELECT id FROM public.app_settings LIMIT 1);

  INSERT INTO public.webauthn_audit (event, user_id, detail, actor_id)
  VALUES ('policy_change', auth.uid(),
          format('Enrollment policy changed: required %s -> %s, grace %s -> %s days, roles [%s] -> [%s]',
                 COALESCE(_was, false), COALESCE(_required, false),
                 _was_grace, _grace_days,
                 array_to_string(_was_roles, ','), array_to_string(_role_enum, ',')),
          auth.uid());

  RETURN public.webauthn_my_enrollment_status();
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_admin_set_enrollment_policy(boolean, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_admin_set_enrollment_policy(boolean, integer, text[]) TO authenticated, service_role;

-- Admin / command-tier readable audit feed with staff names.
CREATE OR REPLACE FUNCTION public.webauthn_audit_feed(
  _events text[] DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  event text,
  user_id uuid,
  staff_name text,
  staff_identifier text,
  actor_id uuid,
  actor_name text,
  device_label text,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'oic')
          OR public.has_role(auth.uid(), '2ic')) THEN
    RAISE EXCEPTION 'Only administrators, OIC or 2IC may read the biometric audit log.';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.created_at,
         a.event,
         a.user_id,
         p.full_name AS staff_name,
         p.staff_id AS staff_identifier,
         a.actor_id,
         ap.full_name AS actor_name,
         a.device_label,
         a.detail
    FROM public.webauthn_audit a
    LEFT JOIN public.profiles p ON p.user_id = a.user_id
    LEFT JOIN public.profiles ap ON ap.user_id = a.actor_id
   WHERE (_events IS NULL OR array_length(_events, 1) IS NULL OR a.event = ANY(_events))
     AND (_since IS NULL OR a.created_at >= _since)
   ORDER BY a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_audit_feed(text[], timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_audit_feed(text[], timestamptz, integer) TO authenticated, service_role;