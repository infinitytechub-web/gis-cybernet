-- 1. Forged / fabricated number detection
CREATE OR REPLACE FUNCTION public.gh_phone_is_suspicious(_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  local_no text;
  rest text;
BEGIN
  local_no := public.gh_phone_normalize(_input);
  IF local_no IS NULL THEN RETURN false; END IF;
  rest := substr(local_no, 4); -- 7 subscriber digits
  IF rest ~ '^(\d)\1{6}$' THEN RETURN true; END IF;
  IF rest IN ('0000000','1234567','7654321','1111111','0123456') THEN RETURN true; END IF;
  IF rest ~ '^(\d\d)\1{2}\d$' THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- 2. Single-number validator that also rejects fabricated patterns
CREATE OR REPLACE FUNCTION public.gh_phone_validate_one(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  norm text;
BEGIN
  IF _input IS NULL OR btrim(_input) = '' THEN RETURN NULL; END IF;
  norm := public.gh_phone_normalize(_input);
  IF norm IS NULL OR public.gh_phone_network(norm) IS NULL THEN
    RAISE EXCEPTION 'Invalid Ghana telephone number "%" — expected 10 digits on MTN, Telecel or AirtelTigo', btrim(_input)
      USING ERRCODE = '22023';
  END IF;
  IF public.gh_phone_is_suspicious(norm) THEN
    RAISE EXCEPTION 'Telephone number "%" looks fabricated — please provide a genuine number', btrim(_input)
      USING ERRCODE = '22023';
  END IF;
  RETURN norm;
END;
$$;

-- 3. List validator now rejects fabricated numbers too
CREATE OR REPLACE FUNCTION public.gh_phone_normalize_list(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  part text;
  out_parts text[] := '{}';
BEGIN
  IF _input IS NULL OR btrim(_input) = '' THEN RETURN NULL; END IF;
  FOREACH part IN ARRAY string_to_array(_input, ',') LOOP
    IF btrim(part) = '' THEN CONTINUE; END IF;
    out_parts := out_parts || public.gh_phone_validate_one(part);
  END LOOP;
  IF array_length(out_parts, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN array_to_string(out_parts, ', ');
END;
$$;

-- 4. Generic trigger: validates a comma-separated phone column named by TG_ARGV[0]
CREATE OR REPLACE FUNCTION public.validate_gh_phone_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col text := TG_ARGV[0];
  new_val text;
  old_val text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;
  IF new_val IS NULL OR btrim(new_val) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
    IF old_val IS NOT DISTINCT FROM new_val THEN
      RETURN NEW;
    END IF;
  END IF;
  new_val := public.gh_phone_normalize_list(new_val);
  NEW := jsonb_populate_record(NEW, to_jsonb(NEW) || jsonb_build_object(col, new_val));
  RETURN NEW;
END;
$$;

-- 5. Attach to local-entity phone columns
DROP TRIGGER IF EXISTS trg_gh_phone_inventory_suppliers ON public.inventory_suppliers;
CREATE TRIGGER trg_gh_phone_inventory_suppliers
BEFORE INSERT OR UPDATE OF phone ON public.inventory_suppliers
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_procurement_vendors ON public.procurement_vendors;
CREATE TRIGGER trg_gh_phone_procurement_vendors
BEFORE INSERT OR UPDATE OF phone ON public.procurement_vendors
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_app_settings ON public.app_settings;
CREATE TRIGGER trg_gh_phone_app_settings
BEFORE INSERT OR UPDATE OF contact_phone ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('contact_phone');

DROP TRIGGER IF EXISTS trg_gh_phone_detention_visitor_log ON public.detention_visitor_log;
CREATE TRIGGER trg_gh_phone_detention_visitor_log
BEFORE INSERT OR UPDATE OF phone ON public.detention_visitor_log
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('phone');

DROP TRIGGER IF EXISTS trg_gh_phone_permits_host ON public.permits;
CREATE TRIGGER trg_gh_phone_permits_host
BEFORE INSERT OR UPDATE OF host_phone ON public.permits
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('host_phone');

DROP TRIGGER IF EXISTS trg_gh_phone_visa_applications_host ON public.visa_applications;
CREATE TRIGGER trg_gh_phone_visa_applications_host
BEFORE INSERT OR UPDATE OF host_phone ON public.visa_applications
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('host_phone');

DROP TRIGGER IF EXISTS trg_gh_phone_visa_extensions_host ON public.visa_extensions;
CREATE TRIGGER trg_gh_phone_visa_extensions_host
BEFORE INSERT OR UPDATE OF host_phone ON public.visa_extensions
FOR EACH ROW EXECUTE FUNCTION public.validate_gh_phone_column('host_phone');

GRANT EXECUTE ON FUNCTION public.gh_phone_is_suspicious(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gh_phone_validate_one(text) TO authenticated, service_role;