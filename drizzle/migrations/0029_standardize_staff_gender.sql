CREATE OR REPLACE FUNCTION public.normalize_gender(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _v IS NULL OR btrim(_v) = '' THEN NULL
    WHEN lower(btrim(_v)) IN ('m','male') THEN 'Male'
    WHEN lower(btrim(_v)) IN ('f','female') THEN 'Female'
    ELSE btrim(_v) END
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_gender()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'staff_dependents' THEN
    NEW.sex := public.normalize_gender(NEW.sex);
  ELSE
    NEW.gender := public.normalize_gender(NEW.gender);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS aa_normalize_gender ON public.profiles;
CREATE TRIGGER aa_normalize_gender BEFORE INSERT OR UPDATE OF gender ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_gender();
DROP TRIGGER IF EXISTS aa_normalize_gender ON public.duty_roster_entries;
CREATE TRIGGER aa_normalize_gender BEFORE INSERT OR UPDATE OF gender ON public.duty_roster_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_gender();
DROP TRIGGER IF EXISTS aa_normalize_gender ON public.pending_staff_matches;
CREATE TRIGGER aa_normalize_gender BEFORE INSERT OR UPDATE OF gender ON public.pending_staff_matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_gender();
DROP TRIGGER IF EXISTS aa_normalize_gender ON public.staff_dependents;
CREATE TRIGGER aa_normalize_gender BEFORE INSERT OR UPDATE OF sex ON public.staff_dependents
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_gender();

UPDATE public.profiles SET gender = public.normalize_gender(gender)
  WHERE gender IS NOT NULL AND gender IS DISTINCT FROM public.normalize_gender(gender);