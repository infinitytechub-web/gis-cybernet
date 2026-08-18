-- Ghana telephone validation (server-side enforcement)

CREATE OR REPLACE FUNCTION public.gh_phone_normalize(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF _input IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_input, '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 5) = '00233' THEN
    d := substr(d, 6);
  ELSIF left(d, 3) = '233' THEN
    d := substr(d, 4);
  ELSIF left(d, 1) = '0' THEN
    d := substr(d, 2);
  END IF;
  IF length(d) <> 9 THEN RETURN NULL; END IF;
  RETURN '0' || d;
END;
$$;

CREATE OR REPLACE FUNCTION public.gh_phone_network(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  local_no text;
  p text;
BEGIN
  local_no := public.gh_phone_normalize(_input);
  IF local_no IS NULL THEN RETURN NULL; END IF;
  p := left(local_no, 3);
  IF p IN ('024','054','055','059','025','053') THEN RETURN 'MTN'; END IF;
  IF p IN ('020','050') THEN RETURN 'Telecel'; END IF;
  IF p IN ('026','056','027','057') THEN RETURN 'AirtelTigo'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.gh_phone_is_valid(_input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.gh_phone_network(_input) IS NOT NULL;
$$;

-- Validates and canonicalises a comma-separated list of Ghana numbers.
CREATE OR REPLACE FUNCTION public.gh_phone_normalize_list(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  part text;
  out_parts text[] := '{}';
  norm text;
BEGIN
  IF _input IS NULL OR btrim(_input) = '' THEN RETURN NULL; END IF;
  FOREACH part IN ARRAY string_to_array(_input, ',') LOOP
    IF btrim(part) = '' THEN CONTINUE; END IF;
    norm := public.gh_phone_normalize(part);
    IF norm IS NULL OR public.gh_phone_network(norm) IS NULL THEN
      RAISE EXCEPTION 'Invalid Ghana telephone number "%" — expected 10 digits on MTN, Telecel or AirtelTigo', btrim(part)
        USING ERRCODE = '22023';
    END IF;
    out_parts := out_parts || norm;
  END LOOP;
  IF array_length(out_parts, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN array_to_string(out_parts, ', ');
END;
$$;

-- profiles.phone: validate + canonicalise, only when the value actually changes
CREATE OR REPLACE FUNCTION public.validate_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    NEW.phone := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.phone IS NOT DISTINCT FROM NEW.phone THEN
    RETURN NEW;
  END IF;
  NEW.phone := public.gh_phone_normalize_list(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_phone ON public.profiles;
CREATE TRIGGER trg_validate_profile_phone
BEFORE INSERT OR UPDATE OF phone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_phone();

-- profile_contacts: phone-like contact types are validated the same way
CREATE OR REPLACE FUNCTION public.validate_profile_contact_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_type IS NULL OR NEW.contact_type NOT IN ('mobile','home','work','whatsapp','emergency') THEN
    RETURN NEW;
  END IF;
  IF NEW.value IS NULL OR btrim(NEW.value) = '' THEN
    RAISE EXCEPTION 'Contact number is required' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM NEW.value THEN
    RETURN NEW;
  END IF;
  NEW.value := public.gh_phone_normalize_list(NEW.value);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_contact_value ON public.profile_contacts;
CREATE TRIGGER trg_validate_profile_contact_value
BEFORE INSERT OR UPDATE OF value ON public.profile_contacts
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_contact_value();

GRANT EXECUTE ON FUNCTION public.gh_phone_normalize(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gh_phone_network(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gh_phone_is_valid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gh_phone_normalize_list(text) TO authenticated, service_role;