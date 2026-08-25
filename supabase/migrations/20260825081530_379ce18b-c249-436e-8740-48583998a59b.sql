ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS staff_id_mask_rules jsonb NOT NULL DEFAULT jsonb_build_object(
    'full_roles', jsonb_build_array('admin', 'oic', '2ic'),
    'owner_sees_full', true,
    'default', jsonb_build_object('mode', 'partial', 'head', 3, 'tail', 2, 'char', '•'),
    'role_overrides', '{}'::jsonb,
    'context_overrides', jsonb_build_object(
      'export', jsonb_build_object('mode', 'partial', 'head', 0, 'tail', 2, 'char', '•')
    )
  );

DROP FUNCTION IF EXISTS public.get_public_app_settings();
CREATE FUNCTION public.get_public_app_settings()
 RETURNS TABLE(org_name text, system_label text, auto_logout_minutes integer, auto_logout_warning_seconds integer, enforce_password_change boolean, min_password_length integer, allow_self_registration boolean, enable_system_health_widget boolean, company_name text, logo_url text, favicon_url text, login_logo_url text, dashboard_logo_url text, primary_color text, secondary_color text, accent_color text, footer_text text, staff_id_mask_rules jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    org_name,
    system_label,
    auto_logout_minutes,
    auto_logout_warning_seconds,
    enforce_password_change,
    min_password_length,
    allow_self_registration,
    enable_system_health_widget,
    company_name,
    logo_url,
    favicon_url,
    login_logo_url,
    dashboard_logo_url,
    primary_color,
    secondary_color,
    accent_color,
    footer_text,
    staff_id_mask_rules
  FROM public.app_settings
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_public_app_settings() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO authenticated;