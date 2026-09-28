ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_staff_category_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_staff_category_check CHECK (staff_category IS NULL OR staff_category = ANY (ARRAY['Cadet','Recruit','Course']));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_training_designation_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_training_designation_check CHECK (training_designation IS NULL OR training_designation = ANY (ARRAY['HUHUNYA','ITTRAS','Other']));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS training_designation_other text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_region text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS height_min_cm integer NOT NULL DEFAULT 120;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS height_max_cm integer NOT NULL DEFAULT 230;
ALTER TABLE public.staff_biodata_verifications ADD COLUMN IF NOT EXISTS authority text;
COMMENT ON COLUMN public.profiles.cadet_intake IS 'DEPRECATED: replaced by staff_category + intake';
COMMENT ON COLUMN public.profiles.recruit_intake IS 'DEPRECATED: replaced by staff_category + intake';

CREATE OR REPLACE FUNCTION public.validate_profile_height()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _min int := 120; _max int := 230;
BEGIN
  IF NEW.height_cm IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.height_cm IS NOT DISTINCT FROM OLD.height_cm THEN RETURN NEW; END IF;
  SELECT COALESCE(height_min_cm,120), COALESCE(height_max_cm,230) INTO _min, _max FROM public.app_settings LIMIT 1;
  IF NEW.height_cm < COALESCE(_min,120) OR NEW.height_cm > COALESCE(_max,230) THEN
    RAISE EXCEPTION 'Height must be between % and % cm', COALESCE(_min,120), COALESCE(_max,230);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_profile_height ON public.profiles;
CREATE TRIGGER trg_validate_profile_height BEFORE INSERT OR UPDATE OF height_cm ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_height();

CREATE OR REPLACE FUNCTION public.validate_verification_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.authority IS NULL THEN RETURN NEW; END IF;
  IF NEW.authority NOT IN ('regional_commander','sector_commander','command_oic','command_2ic','other') THEN
    RAISE EXCEPTION 'Invalid approving authority';
  END IF;
  IF NEW.authority = 'other' AND (TG_OP = 'INSERT' OR OLD.authority IS DISTINCT FROM 'other' OR OLD.name IS DISTINCT FROM NEW.name)
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic')
              OR public.has_role(auth.uid(),'command_officer') OR public.has_role(auth.uid(),'head_of_administration')) THEN
    RAISE EXCEPTION 'Only authorized approvers can enter a custom approving authority';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_verification_authority ON public.staff_biodata_verifications;
CREATE TRIGGER trg_validate_verification_authority BEFORE INSERT OR UPDATE ON public.staff_biodata_verifications
FOR EACH ROW EXECUTE FUNCTION public.validate_verification_authority();