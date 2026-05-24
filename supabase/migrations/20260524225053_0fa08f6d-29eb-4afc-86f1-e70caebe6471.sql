
-- =========================================================
-- 1. APP_SETTINGS: restrict full SELECT, expose safe subset via RPC
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON public.app_settings;

CREATE POLICY "Command tier can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Safe public-subset accessor for any authenticated user (UI/runtime needs)
CREATE OR REPLACE FUNCTION public.get_public_app_settings()
RETURNS TABLE (
  org_name text,
  system_label text,
  auto_logout_minutes integer,
  auto_logout_warning_seconds integer,
  enforce_password_change boolean,
  min_password_length integer,
  allow_self_registration boolean,
  enable_system_health_widget boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    org_name,
    system_label,
    auto_logout_minutes,
    auto_logout_warning_seconds,
    enforce_password_change,
    min_password_length,
    allow_self_registration,
    enable_system_health_widget
  FROM public.app_settings
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_app_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO authenticated;

-- =========================================================
-- 2. HRM_EXPORT_SETTINGS: restrict SELECT to command tier
-- =========================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.hrm_export_settings'::regclass
      AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.hrm_export_settings', p.polname);
  END LOOP;
END $$;

CREATE POLICY "Command tier can read hrm export settings"
ON public.hrm_export_settings
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 3. PERMISSION_MATRIX_OVERRIDES: restrict SELECT to command tier
-- =========================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.permission_matrix_overrides'::regclass
      AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.permission_matrix_overrides', p.polname);
  END LOOP;
END $$;

CREATE POLICY "Command tier can read permission overrides"
ON public.permission_matrix_overrides
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 4. FRONT_DESK_AUDIT_LOG: append-only
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete audit logs" ON public.front_desk_audit_log;
DROP POLICY IF EXISTS "Admins can update audit logs" ON public.front_desk_audit_log;

CREATE POLICY "Audit log no updates"
ON public.front_desk_audit_log
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Audit log no deletes"
ON public.front_desk_audit_log
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- =========================================================
-- 5. SYSTEM_AUDIT_LOG: append-only
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete audit logs" ON public.system_audit_log;
DROP POLICY IF EXISTS "Admins can update audit logs" ON public.system_audit_log;

CREATE POLICY "System audit log no updates"
ON public.system_audit_log
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "System audit log no deletes"
ON public.system_audit_log
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);
