ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS system_description text,
  ADD COLUMN IF NOT EXISTS header_text text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS contact_website text;

DROP FUNCTION IF EXISTS public.get_public_branding();

CREATE FUNCTION public.get_public_branding()
RETURNS TABLE (
  org_name text,
  system_label text,
  company_name text,
  logo_url text,
  favicon_url text,
  login_logo_url text,
  dashboard_logo_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  footer_text text,
  system_description text,
  header_text text,
  contact_email text,
  contact_phone text,
  contact_address text,
  contact_website text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.org_name, a.system_label, a.company_name, a.logo_url, a.favicon_url,
    a.login_logo_url, a.dashboard_logo_url, a.primary_color, a.secondary_color,
    a.accent_color, a.footer_text, a.system_description, a.header_text,
    a.contact_email, a.contact_phone, a.contact_address, a.contact_website
  FROM public.app_settings a
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated, service_role;