-- Contact-form phone validation: Ghana-strict, international-tolerant.
CREATE OR REPLACE FUNCTION public.gh_phone_is_foreign_dialled(_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE s text; d text;
BEGIN
  s := regexp_replace(coalesce(_input, ''), '[^0-9+]', '', 'g');
  IF s = '' THEN RETURN false; END IF;
  IF left(s, 1) <> '+' AND left(s, 2) <> '00' THEN RETURN false; END IF;
  d := regexp_replace(s, '[^0-9]', '', 'g');
  d := regexp_replace(d, '^00', '');
  RETURN left(d, 3) <> '233';
END;
$$;

-- Returns the canonical value to store, or raises when the number is unusable.
CREATE OR REPLACE FUNCTION public.gh_phone_contact_canonical(_input text, _label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE raw text; d text; local_num text;
BEGIN
  raw := btrim(coalesce(_input, ''));
  IF raw = '' THEN RETURN NULL; END IF;

  IF public.gh_phone_is_foreign_dialled(raw) THEN
    d := regexp_replace(regexp_replace(raw, '[^0-9]', '', 'g'), '^00', '');
    IF length(d) < 8 OR length(d) > 15 THEN
      RAISE EXCEPTION '% "%": international numbers must have 8-15 digits including the country code', _label, raw;
    END IF;
    IF d ~ '^(\d)\1+$' THEN
      RAISE EXCEPTION '% "%": this number looks fabricated', _label, raw;
    END IF;
    RETURN '+' || d;
  END IF;

  local_num := public.gh_phone_normalize(raw);
  IF local_num IS NULL OR NOT public.gh_phone_is_valid(local_num) THEN
    RAISE EXCEPTION '% "%": not a licensed Ghana mobile number (MTN, Telecel or AirtelTigo)', _label, raw;
  END IF;
  IF public.gh_phone_is_suspicious(local_num) THEN
    RAISE EXCEPTION '% "%": this number looks fabricated', _label, raw;
  END IF;
  RETURN local_num;
END;
$$;

-- Canonicalises a comma-separated list of contact numbers.
CREATE OR REPLACE FUNCTION public.gh_phone_contact_canonical_list(_input text, _label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE part text; out_parts text[] := '{}'; canon text;
BEGIN
  IF btrim(coalesce(_input, '')) = '' THEN RETURN NULL; END IF;
  FOREACH part IN ARRAY string_to_array(_input, ',') LOOP
    IF btrim(part) = '' THEN CONTINUE; END IF;
    canon := public.gh_phone_contact_canonical(btrim(part), _label);
    IF canon IS NOT NULL THEN out_parts := out_parts || canon; END IF;
  END LOOP;
  IF array_length(out_parts, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN array_to_string(out_parts, ', ');
END;
$$;

-- Generic trigger: TG_ARGV holds the phone column names to validate.
CREATE OR REPLACE FUNCTION public.gh_phone_guard_contact_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE col text; val text; canon text; rec jsonb;
BEGIN
  rec := to_jsonb(NEW);
  FOREACH col IN ARRAY TG_ARGV LOOP
    val := rec ->> col;
    IF val IS NULL OR btrim(val) = '' THEN CONTINUE; END IF;
    canon := public.gh_phone_contact_canonical_list(val, replace(col, '_', ' '));
    rec := jsonb_set(rec, ARRAY[col], CASE WHEN canon IS NULL THEN 'null'::jsonb ELSE to_jsonb(canon) END);
  END LOOP;
  NEW := jsonb_populate_record(NEW, rec);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gh_phone_is_foreign_dialled(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gh_phone_contact_canonical(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gh_phone_contact_canonical_list(text, text) FROM anon;

DROP TRIGGER IF EXISTS trg_gh_phone_detention_records ON public.detention_records;
CREATE TRIGGER trg_gh_phone_detention_records
BEFORE INSERT OR UPDATE ON public.detention_records
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone', 'next_of_kin_phone');

DROP TRIGGER IF EXISTS trg_gh_phone_detention_bail_records ON public.detention_bail_records;
CREATE TRIGGER trg_gh_phone_detention_bail_records
BEFORE INSERT OR UPDATE ON public.detention_bail_records
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('bailee_phone', 'surety_phone');

DROP TRIGGER IF EXISTS trg_gh_phone_visa_applications_contact ON public.visa_applications;
CREATE TRIGGER trg_gh_phone_visa_applications_contact
BEFORE INSERT OR UPDATE ON public.visa_applications
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_visa_extensions_contact ON public.visa_extensions;
CREATE TRIGGER trg_gh_phone_visa_extensions_contact
BEFORE INSERT OR UPDATE ON public.visa_extensions
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_passport_applications_contact ON public.passport_applications;
CREATE TRIGGER trg_gh_phone_passport_applications_contact
BEFORE INSERT OR UPDATE ON public.passport_applications
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_official_applications_contact ON public.official_applications;
CREATE TRIGGER trg_gh_phone_official_applications_contact
BEFORE INSERT OR UPDATE ON public.official_applications
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_enquiry_applications_contact ON public.enquiry_applications;
CREATE TRIGGER trg_gh_phone_enquiry_applications_contact
BEFORE INSERT OR UPDATE ON public.enquiry_applications
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_permits_contact ON public.permits;
CREATE TRIGGER trg_gh_phone_permits_contact
BEFORE INSERT OR UPDATE ON public.permits
FOR EACH ROW EXECUTE FUNCTION public.gh_phone_guard_contact_columns('phone');