-- 1. Approval columns
ALTER TABLE public.webauthn_credentials
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_credentials_approval_status_check'
  ) THEN
    ALTER TABLE public.webauthn_credentials
      ADD CONSTRAINT webauthn_credentials_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Existing credentials stay usable
UPDATE public.webauthn_credentials
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, created_at)
 WHERE approval_status = 'pending'
   AND created_at < now();

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_approval
  ON public.webauthn_credentials (approval_status)
  WHERE revoked_at IS NULL;

-- 2. Staff view of their own devices, including approval state
DROP FUNCTION IF EXISTS public.webauthn_list_my_credentials();
DROP FUNCTION IF EXISTS public.webauthn_admin_list_credentials();
DROP FUNCTION IF EXISTS public.webauthn_admin_enrollment_report();

CREATE OR REPLACE FUNCTION public.webauthn_list_my_credentials()
RETURNS TABLE(id uuid, device_label text, backed_up boolean, last_used_at timestamptz,
              created_at timestamptz, approval_status text, approved_at timestamptz,
              approval_notes text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.device_label, c.backed_up, c.last_used_at, c.created_at,
         c.approval_status, c.approved_at, c.approval_notes
  FROM public.webauthn_credentials c
  WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL
  ORDER BY c.created_at DESC;
$function$;

-- 3. Personal status counts only approved devices
CREATE OR REPLACE FUNCTION public.webauthn_my_status()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT s.biometric_login_enabled FROM public.webauthn_user_settings s WHERE s.user_id = auth.uid()), false),
    'consented_at', (SELECT s.consented_at FROM public.webauthn_user_settings s WHERE s.user_id = auth.uid()),
    'device_count', (SELECT count(*) FROM public.webauthn_credentials c
                      WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL AND c.approval_status = 'approved'),
    'pending_count', (SELECT count(*) FROM public.webauthn_credentials c
                       WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL AND c.approval_status = 'pending'),
    'globally_enabled', COALESCE((SELECT a.biometric_login_enabled FROM public.app_settings a LIMIT 1), true),
    'stepup_required', COALESCE((SELECT a.biometric_stepup_required FROM public.app_settings a LIMIT 1), true)
  );
$function$;

CREATE OR REPLACE FUNCTION public.webauthn_my_enrollment_status()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL AND c.approval_status = 'approved') AS device_count,
      (SELECT count(*) FROM public.webauthn_credentials c
        WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL AND c.approval_status = 'pending') AS pending_count,
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
    'pending_count', me.pending_count,
    'enrolled', me.device_count > 0,
    'awaiting_approval', (me.device_count = 0 AND me.pending_count > 0),
    'days_left', GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((s.enforced_at + make_interval(days => s.grace_days)) - now())) / 86400.0)
    )::int,
    'overdue', (
      s.required AND s.globally_enabled AND me.role_match AND me.device_count = 0
      AND me.pending_count = 0
      AND now() > s.enforced_at + make_interval(days => s.grace_days)
    )
  )
  FROM s, me;
$function$;

-- 4. Admin credential list shows approval state
CREATE OR REPLACE FUNCTION public.webauthn_admin_list_credentials()
RETURNS TABLE(id uuid, user_id uuid, full_name text, staff_id text, device_label text,
              backed_up boolean, last_used_at timestamptz, created_at timestamptz,
              revoked_at timestamptz, approval_status text, approved_at timestamptz,
              approval_notes text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may list biometric credentials.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.user_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS full_name,
         p.staff_id, c.device_label, c.backed_up,
         c.last_used_at, c.created_at, c.revoked_at,
         c.approval_status, c.approved_at, c.approval_notes
  FROM public.webauthn_credentials c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  ORDER BY c.revoked_at NULLS FIRST, c.created_at DESC;
END;
$function$;

-- 5. Pending approval queue
CREATE OR REPLACE FUNCTION public.webauthn_admin_pending_enrollments()
RETURNS TABLE(id uuid, user_id uuid, full_name text, staff_id text, department text,
              device_label text, backed_up boolean, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may review biometric enrollments.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.user_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS full_name,
         p.staff_id, d.name AS department,
         c.device_label, c.backed_up, c.created_at
  FROM public.webauthn_credentials c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE c.revoked_at IS NULL AND c.approval_status = 'pending'
  ORDER BY c.created_at ASC;
END;
$function$;

-- 6. Approve / reject a registration
CREATE OR REPLACE FUNCTION public.webauthn_admin_review_enrollment(
  _id uuid, _approve boolean, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cred public.webauthn_credentials;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators may approve biometric enrollments.';
  END IF;

  SELECT * INTO _cred FROM public.webauthn_credentials WHERE id = _id;
  IF _cred.id IS NULL THEN
    RAISE EXCEPTION 'Biometric registration not found.';
  END IF;
  IF _cred.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This device has already been removed.';
  END IF;

  UPDATE public.webauthn_credentials
     SET approval_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         approved_by = auth.uid(),
         approved_at = now(),
         approval_notes = left(COALESCE(_notes, ''), 500),
         revoked_at = CASE WHEN _approve THEN NULL ELSE now() END,
         revoked_by = CASE WHEN _approve THEN NULL ELSE auth.uid() END
   WHERE id = _id;

  INSERT INTO public.webauthn_audit (event, user_id, credential_id, device_label, detail, actor_id)
  VALUES (CASE WHEN _approve THEN 'status_change' ELSE 'revoke' END,
          _cred.user_id, _cred.credential_id, _cred.device_label,
          CASE WHEN _approve THEN 'Enrollment approved by administrator'
               ELSE 'Enrollment rejected by administrator' END
          || COALESCE(': ' || NULLIF(btrim(COALESCE(_notes, '')), ''), ''),
          auth.uid());

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_cred.user_id,
          CASE WHEN _approve THEN 'Biometric enrollment approved' ELSE 'Biometric enrollment rejected' END,
          CASE WHEN _approve
               THEN _cred.device_label || ' has been approved. You can now sign in with your fingerprint or Face ID.'
               ELSE _cred.device_label || ' was not approved for biometric sign-in.'
               || COALESCE(' Reason: ' || NULLIF(btrim(COALESCE(_notes, '')), ''), '') END,
          CASE WHEN _approve THEN 'success' ELSE 'warning' END);
END;
$function$;

-- 7. Coverage report reflects approval
CREATE OR REPLACE FUNCTION public.webauthn_admin_enrollment_report()
RETURNS TABLE(user_id uuid, full_name text, staff_id text, department text, roles text[],
              required boolean, device_count integer, pending_count integer,
              first_enrolled_at timestamptz, last_used_at timestamptz, compliance text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS full_name,
         p.staff_id,
         d.name AS department,
         COALESCE(r.roles, ARRAY[]::text[]) AS roles,
         (_required AND COALESCE(r.role_match, false)) AS required,
         COALESCE(c.approved_count, 0)::int AS device_count,
         COALESCE(c.pending_count, 0)::int AS pending_count,
         c.first_enrolled_at,
         c.last_used_at,
         CASE
           WHEN COALESCE(c.approved_count, 0) > 0 THEN 'enrolled'
           WHEN COALESCE(c.pending_count, 0) > 0 THEN 'awaiting_approval'
           WHEN NOT (_required AND COALESCE(r.role_match, false)) THEN 'not_required'
           WHEN now() > _enforced + make_interval(days => _grace) THEN 'overdue'
           ELSE 'grace'
         END AS compliance
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN (
      SELECT ur.user_id,
             array_agg(ur.role::text ORDER BY ur.role::text) AS roles,
             bool_or(ur.role = ANY (_roles)) AS role_match
        FROM public.user_roles ur
       GROUP BY ur.user_id
    ) r ON r.user_id = p.user_id
    LEFT JOIN (
      SELECT wc.user_id,
             count(*) FILTER (WHERE wc.approval_status = 'approved') AS approved_count,
             count(*) FILTER (WHERE wc.approval_status = 'pending') AS pending_count,
             min(wc.created_at) FILTER (WHERE wc.approval_status = 'approved') AS first_enrolled_at,
             max(wc.last_used_at) AS last_used_at
        FROM public.webauthn_credentials wc
       WHERE wc.revoked_at IS NULL
       GROUP BY wc.user_id
    ) c ON c.user_id = p.user_id
   WHERE p.user_id IS NOT NULL
   ORDER BY (COALESCE(c.approved_count, 0) > 0),
            NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') NULLS LAST;
END;
$function$;