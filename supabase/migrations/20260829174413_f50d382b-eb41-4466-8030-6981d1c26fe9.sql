ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS recaptcha_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recaptcha_site_key text,
  ADD COLUMN IF NOT EXISTS recaptcha_min_score numeric NOT NULL DEFAULT 0.5;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_recaptcha_min_score_range;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_recaptcha_min_score_range
  CHECK (recaptcha_min_score >= 0 AND recaptcha_min_score <= 1);

CREATE OR REPLACE FUNCTION public.get_recaptcha_config()
RETURNS TABLE(enabled boolean, site_key text, min_score numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(recaptcha_enabled, false) AND COALESCE(NULLIF(btrim(recaptcha_site_key), ''), '') <> '',
    NULLIF(btrim(recaptcha_site_key), ''),
    COALESCE(recaptcha_min_score, 0.5)
  FROM public.app_settings
  ORDER BY created_at ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_recaptcha_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recaptcha_config() TO anon, authenticated, service_role;