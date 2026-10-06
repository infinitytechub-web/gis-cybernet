CREATE OR REPLACE FUNCTION public.normalize_profile_name_case()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.first_name := NULLIF(upper(btrim(regexp_replace(NEW.first_name, '\s+', ' ', 'g'))), '');
  NEW.last_name := NULLIF(upper(btrim(regexp_replace(NEW.last_name, '\s+', ' ', 'g'))), '');
  NEW.other_names := NULLIF(upper(btrim(regexp_replace(NEW.other_names, '\s+', ' ', 'g'))), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_profile_name_case ON public.profiles;
CREATE TRIGGER trg_normalize_profile_name_case BEFORE INSERT OR UPDATE OF first_name, last_name, other_names ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_name_case();