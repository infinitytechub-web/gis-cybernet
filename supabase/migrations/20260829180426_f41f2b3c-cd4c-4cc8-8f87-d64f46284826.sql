ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS biometric_enrollment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS biometric_enrollment_grace_days integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS biometric_enrollment_enforced_at timestamptz,
  ADD COLUMN IF NOT EXISTS biometric_required_roles public.app_role[] NOT NULL DEFAULT ARRAY[
    'admin','oic','2ic','staff_officer','supervisor','command_officer',
    'shift_supervisor','shift_leader','front_desk','storekeeper',
    'procurement_officer','medical_officer','head_of_administration',
    'chief_staff_officer','head_of_processing'
  ]::public.app_role[];

-- Policy + personal compliance state for the calling staff member.
CREATE OR REPLACE FUNCTION public.webauthn_my_enrollment_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT
      COALESCE(a.biometric_enrollment_required, false) AS required,
      GREATEST(COALESCE(a.biometric_enrollment_grace_days, 15), 0) AS grace_days,
      COALESCE(a.biometric_enrollment_enforced_at, now()) AS enforced_at,
      COALESCE(a.biometric_required_roles, '{}'::public.app_role[]) AS roles,
      COALESCE(a.biometric_login_enabled, true) AS globally_enabled
    FROM public.app_settings a
    LIMIT 1
  ),
  me AS (
    SELECT
      (SELECT count(*) FROM public.webauthn_credentials c
        WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL) AS device_count,
      EXISTS (
        SELECT 1 FROM public.user_roles ur, s
        WHERE ur.user_id = auth.uid() AND ur.role = ANY (s.roles)
      ) AS role_match
  )
  SELECT jsonb_build_object(
    'policy_required', s.required,
    'globally_enabled', s.globally_enabled,
    'grace_days', s.grace_days,
    'enforced_at', s.enforced_at,
    'deadline', s.enforced_at + make_interval(days => s.grace_days),
    'required_for_me', (s.required AND s.globally_enabled AND me.role_match),
    'device_count', me.device_count,
    'enrolled', me.device_count > 0,
    'days_left', GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((s.enforced_at + make_interval(days => s.grace_days)) - now())) / 86400.0)
    )::int,
    'overdue', (
      s.required AND s.globally_enabled AND me.role_match AND me.device_count = 0
      AND now() > s.enforced_at + make_interval(days => s.grace_days)
    )
  )
  FROM s, me;
$$;

REVOKE ALL ON FUNCTION public.webauthn_my_enrollment_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_my_enrollment_status() TO authenticated, service_role;

-- Administrator coverage report across all staff accounts.
CREATE OR REPLACE FUNCTION public.webauthn_admin_enrollment_report()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  staff_id text,
  department text,
  roles text[],
  required boolean,
  device_count integer,
  first_enrolled_at timestamptz,
  last_used_at timestamptz,
  compliance text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _required boolean;
  _grace integer;
  _enforced timestamptz;
  _roles public.app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may view biometric enrollment coverage.';
  END IF;

  SELECT COALESCE(a.biometric_enrollment_required, false),
         GREATEST(COALESCE(a.biometric_enrollment_grace_days, 15), 0),
         COALESCE(a.biometric_enrollment_enforced_at, now()),
         COALESCE(a.biometric_required_roles, '{}'::public.app_role[])
    INTO _required, _grace, _enforced, _roles
    FROM public.app_settings a LIMIT 1;

  RETURN QUERY
  SELECT p.user_id,
         p.full_name,
         p.staff_id,
         p.department,
         COALESCE(r.roles, ARRAY[]::text[]) AS roles,
         (_required AND COALESCE(r.role_match, false)) AS required,
         COALESCE(c.device_count, 0)::int AS device_count,
         c.first_enrolled_at,
         c.last_used_at,
         CASE
           WHEN COALESCE(c.device_count, 0) > 0 THEN 'enrolled'
           WHEN NOT (_required AND COALESCE(r.role_match, false)) THEN 'not_required'
           WHEN now() > _enforced + make_interval(days => _grace) THEN 'overdue'
           ELSE 'grace'
         END AS compliance
    FROM public.profiles p
    LEFT JOIN (
      SELECT ur.user_id,
             array_agg(ur.role::text ORDER BY ur.role::text) AS roles,
             bool_or(ur.role = ANY (_roles)) AS role_match
        FROM public.user_roles ur
       GROUP BY ur.user_id
    ) r ON r.user_id = p.user_id
    LEFT JOIN (
      SELECT wc.user_id,
             count(*) AS device_count,
             min(wc.created_at) AS first_enrolled_at,
             max(wc.last_used_at) AS last_used_at
        FROM public.webauthn_credentials wc
       WHERE wc.revoked_at IS NULL
       GROUP BY wc.user_id
    ) c ON c.user_id = p.user_id
   WHERE p.user_id IS NOT NULL
   ORDER BY (COALESCE(c.device_count, 0) > 0), p.full_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_admin_enrollment_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_admin_enrollment_report() TO authenticated, service_role;

-- Administrator-only policy update, audited.
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

  SELECT COALESCE(biometric_enrollment_required, false) INTO _was FROM public.app_settings LIMIT 1;

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
  VALUES ('settings_change', auth.uid(),
          format('Biometric enrollment policy: required=%s, grace=%s days, roles=%s',
                 COALESCE(_required, false), _grace_days, array_to_string(_role_enum, ',')),
          auth.uid());

  RETURN public.webauthn_my_enrollment_status();
END;
$$;

REVOKE ALL ON FUNCTION public.webauthn_admin_set_enrollment_policy(boolean, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webauthn_admin_set_enrollment_policy(boolean, integer, text[]) TO authenticated, service_role;