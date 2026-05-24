-- ============================================================
-- ECOWAS / Non-ECOWAS classifier + GIS-standard fields
-- ============================================================

-- Helper: is_ecowas_country(text) -- matches country name or common demonyms
CREATE OR REPLACE FUNCTION public.is_ecowas_country(_nationality text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _nationality IS NULL OR length(trim(_nationality)) = 0 THEN false
    ELSE lower(trim(_nationality)) = ANY (ARRAY[
      'benin','burkina faso','cabo verde','cape verde','côte d''ivoire','cote d''ivoire','ivory coast',
      'gambia','the gambia','ghana','guinea','guinea-bissau','liberia','mali','niger','nigeria',
      'senegal','sierra leone','togo',
      -- demonyms
      'beninese','beninois','burkinabè','burkinabe','burkinabé','cabo verdean','cape verdean',
      'ivorian','ivoirian','gambian','ghanaian','guinean','guinea-bissauan','bissauan','liberian',
      'malian','nigerien','nigerian','senegalese','sierra leonean','togolese'
    ])
  END
$$;

-- Generic trigger function to derive applicant_category from nationality
CREATE OR REPLACE FUNCTION public.set_applicant_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.applicant_category IS NULL OR NEW.applicant_category = '' OR
     (TG_OP = 'UPDATE' AND NEW.nationality IS DISTINCT FROM OLD.nationality) THEN
    NEW.applicant_category := CASE
      WHEN public.is_ecowas_country(NEW.nationality) THEN 'ecowas'
      WHEN NEW.nationality IS NOT NULL AND length(trim(NEW.nationality)) > 0 THEN 'non_ecowas'
      ELSE NEW.applicant_category
    END;
  END IF;
  -- normalise
  IF NEW.applicant_category IS NOT NULL AND NEW.applicant_category NOT IN ('ecowas','non_ecowas') THEN
    RAISE EXCEPTION 'applicant_category must be ecowas or non_ecowas';
  END IF;
  RETURN NEW;
END;
$$;

-- ---- visa_applications ----
ALTER TABLE public.visa_applications
  ADD COLUMN IF NOT EXISTS applicant_category text,
  ADD COLUMN IF NOT EXISTS visa_class text,                 -- single_entry | multiple_entry | transit | emergency | ecowas_residence
  ADD COLUMN IF NOT EXISTS duration_of_stay_days integer,
  ADD COLUMN IF NOT EXISTS letter_of_invitation boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS biometrics_captured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ecowas_id_number text,           -- ECOWAS national ID / travel certificate
  ADD COLUMN IF NOT EXISTS yellow_fever_cert boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_visa_applications_applicant_category ON public.visa_applications(applicant_category);

DROP TRIGGER IF EXISTS trg_visa_applications_set_category ON public.visa_applications;
CREATE TRIGGER trg_visa_applications_set_category
BEFORE INSERT OR UPDATE OF nationality, applicant_category ON public.visa_applications
FOR EACH ROW EXECUTE FUNCTION public.set_applicant_category();

UPDATE public.visa_applications
SET applicant_category = CASE WHEN public.is_ecowas_country(nationality) THEN 'ecowas' ELSE 'non_ecowas' END
WHERE applicant_category IS NULL AND nationality IS NOT NULL;

-- ---- visa_extensions ----
ALTER TABLE public.visa_extensions
  ADD COLUMN IF NOT EXISTS applicant_category text,
  ADD COLUMN IF NOT EXISTS extension_duration_days integer,
  ADD COLUMN IF NOT EXISTS ecowas_id_number text,
  ADD COLUMN IF NOT EXISTS biometrics_captured boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_visa_extensions_applicant_category ON public.visa_extensions(applicant_category);

DROP TRIGGER IF EXISTS trg_visa_extensions_set_category ON public.visa_extensions;
CREATE TRIGGER trg_visa_extensions_set_category
BEFORE INSERT OR UPDATE OF nationality, applicant_category ON public.visa_extensions
FOR EACH ROW EXECUTE FUNCTION public.set_applicant_category();

UPDATE public.visa_extensions
SET applicant_category = CASE WHEN public.is_ecowas_country(nationality) THEN 'ecowas' ELSE 'non_ecowas' END
WHERE applicant_category IS NULL AND nationality IS NOT NULL;

-- ---- permits ----
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS applicant_category text,
  ADD COLUMN IF NOT EXISTS ecowas_id_number text,
  ADD COLUMN IF NOT EXISTS biometrics_captured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS yellow_fever_cert boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS police_clearance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_clearance boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_permits_applicant_category ON public.permits(applicant_category);

DROP TRIGGER IF EXISTS trg_permits_set_category ON public.permits;
CREATE TRIGGER trg_permits_set_category
BEFORE INSERT OR UPDATE OF nationality, applicant_category ON public.permits
FOR EACH ROW EXECUTE FUNCTION public.set_applicant_category();

UPDATE public.permits
SET applicant_category = CASE WHEN public.is_ecowas_country(nationality) THEN 'ecowas' ELSE 'non_ecowas' END
WHERE applicant_category IS NULL AND nationality IS NOT NULL;