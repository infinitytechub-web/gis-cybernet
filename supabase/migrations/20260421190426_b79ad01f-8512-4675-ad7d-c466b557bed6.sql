-- Normalize and validate Ghana Post GPS digital addresses on operation location fields.
--
-- Accepted shapes (after trimming + uppercasing + collapsing internal whitespace):
--   1) Bare digital address:           XX-###-####                e.g. "GA-123-4567"
--   2) Digital address with coords:    XX-###-#### (lat, lng)     e.g. "GA-123-4567 (5.612345, -0.187654)"
--   3) Free-form text fallback         (left as-is, just trimmed) e.g. "Amasaman Barrier, Pokuase"
--
-- The trigger only enforces format when the value LOOKS like a digital address
-- (starts with a 2-letter prefix + dash). Plain landmark text is preserved so
-- existing free-form entries continue to work.

CREATE OR REPLACE FUNCTION public.normalize_gps_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _raw text;
  _norm text;
  _digital_re text := '^[A-Z]{2}-[0-9]{3}-[0-9]{4}$';
  _digital_with_coords_re text := '^[A-Z]{2}-[0-9]{3}-[0-9]{4} \([-+]?[0-9]+(\.[0-9]+)?, ?[-+]?[0-9]+(\.[0-9]+)?\)$';
  _looks_digital boolean;
BEGIN
  _raw := NEW.location;

  IF _raw IS NULL OR btrim(_raw) = '' THEN
    NEW.location := NULL;
    RETURN NEW;
  END IF;

  -- Trim, collapse internal whitespace runs, uppercase the digital prefix part.
  _norm := regexp_replace(btrim(_raw), '\s+', ' ', 'g');

  -- If it looks like a digital address (e.g. "ga-123-4567" or with coords),
  -- uppercase the whole thing and validate strictly.
  _looks_digital := _norm ~* '^[a-z]{2}-[0-9]{3}-[0-9]{4}( |$|\()';

  IF _looks_digital THEN
    _norm := upper(_norm);
    -- Allow either bare digital address OR digital + coords suffix.
    IF _norm !~ _digital_re AND _norm !~ _digital_with_coords_re THEN
      RAISE EXCEPTION 'Invalid GPS digital address format: %. Expected XX-###-#### (optionally followed by " (lat, lng)").', _raw
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.location := _norm;
  RETURN NEW;
END;
$$;

-- Attach to enforcement_operations
DROP TRIGGER IF EXISTS trg_normalize_gps_location_enf ON public.enforcement_operations;
CREATE TRIGGER trg_normalize_gps_location_enf
BEFORE INSERT OR UPDATE OF location ON public.enforcement_operations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_gps_location();

-- Attach to operations
DROP TRIGGER IF EXISTS trg_normalize_gps_location_ops ON public.operations;
CREATE TRIGGER trg_normalize_gps_location_ops
BEFORE INSERT OR UPDATE OF location ON public.operations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_gps_location();