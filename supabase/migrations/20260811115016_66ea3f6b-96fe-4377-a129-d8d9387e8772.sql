ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT 'Ghana Immigration Service',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS login_logo_url text,
  ADD COLUMN IF NOT EXISTS dashboard_logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '189 100% 27%',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '220 80% 18%',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '152 70% 30%',
  ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT 'Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026';

DROP FUNCTION IF EXISTS public.get_public_app_settings();
CREATE FUNCTION public.get_public_app_settings()
 RETURNS TABLE(org_name text, system_label text, auto_logout_minutes integer, auto_logout_warning_seconds integer, enforce_password_change boolean, min_password_length integer, allow_self_registration boolean, enable_system_health_widget boolean, company_name text, logo_url text, favicon_url text, login_logo_url text, dashboard_logo_url text, primary_color text, secondary_color text, accent_color text, footer_text text)
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
    footer_text
  FROM public.app_settings
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_public_app_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_branding()
 RETURNS TABLE(org_name text, system_label text, company_name text, logo_url text, favicon_url text, login_logo_url text, dashboard_logo_url text, primary_color text, secondary_color text, accent_color text, footer_text text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    org_name, system_label, company_name, logo_url, favicon_url,
    login_logo_url, dashboard_logo_url, primary_color, secondary_color,
    accent_color, footer_text
  FROM public.app_settings
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;

DROP POLICY IF EXISTS "Branding assets are readable" ON storage.objects;
CREATE POLICY "Branding assets are readable"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins can upload branding assets" ON storage.objects;
CREATE POLICY "Admins can upload branding assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update branding assets" ON storage.objects;
CREATE POLICY "Admins can update branding assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete branding assets" ON storage.objects;
CREATE POLICY "Admins can delete branding assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));