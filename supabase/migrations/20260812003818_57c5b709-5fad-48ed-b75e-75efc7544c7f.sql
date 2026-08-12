-- Normalisation helper: lowercase, strip non-alphanumerics.
CREATE OR REPLACE FUNCTION public.detention_norm(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT nullif(regexp_replace(lower(coalesce(_t, '')), '[^a-z0-9]', '', 'g'), '') $$;

-- Who may run duplicate checks / see detainee records.
CREATE OR REPLACE FUNCTION public.can_access_detention(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(_uid, 'admin'::app_role)
      OR has_role(_uid, 'oic'::app_role)
      OR has_role(_uid, '2ic'::app_role)
      OR has_role(_uid, 'supervisor'::app_role)
      OR has_role(_uid, 'shift_supervisor'::app_role)
      OR has_role(_uid, 'deputy_shift_supervisor'::app_role)
$$;

-- Duplicate detection. Returns one row per candidate match, most severe first.
-- severity: 'block' (same ID/passport already in custody) or 'warn' (likely repeat detainee).
CREATE OR REPLACE FUNCTION public.detention_find_duplicates(
  _first_name text,
  _last_name text,
  _date_of_birth date DEFAULT NULL,
  _id_type text DEFAULT NULL,
  _id_number text DEFAULT NULL,
  _alias text DEFAULT NULL,
  _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  alias text,
  date_of_birth date,
  id_type text,
  id_number text,
  status text,
  intake_at timestamptz,
  cell_number text,
  severity text,
  match_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := public.detention_norm(coalesce(_first_name, '') || coalesce(_last_name, ''));
  v_alias text := public.detention_norm(_alias);
  v_idnum text := public.detention_norm(_id_number);
BEGIN
  IF NOT public.can_access_detention(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to run detainee duplicate checks';
  END IF;

  -- Treat "None" ID type as no identifier at all.
  IF coalesce(_id_type, '') ILIKE 'none' THEN
    v_idnum := NULL;
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT d.id, d.first_name, d.last_name, d.alias, d.date_of_birth, d.id_type,
           d.id_number, d.status, d.intake_at, d.cell_number,
           CASE
             WHEN v_idnum IS NOT NULL
              AND public.detention_norm(d.id_number) = v_idnum
              AND d.status = 'in_custody' THEN 'block'
             ELSE 'warn'
           END AS severity,
           CASE
             WHEN v_idnum IS NOT NULL AND public.detention_norm(d.id_number) = v_idnum
               THEN 'Same ' || coalesce(nullif(d.id_type, ''), 'ID') || ' number'
             WHEN v_name IS NOT NULL
              AND public.detention_norm(d.first_name || d.last_name) = v_name
              AND _date_of_birth IS NOT NULL AND d.date_of_birth = _date_of_birth
               THEN 'Same full name and date of birth'
             WHEN v_name IS NOT NULL
              AND public.detention_norm(d.first_name || d.last_name) = v_name
               THEN 'Same full name'
             ELSE 'Matching alias'
           END AS match_reason
    FROM public.detention_records d
    WHERE (_exclude_id IS NULL OR d.id <> _exclude_id)
      AND (
        (v_idnum IS NOT NULL AND public.detention_norm(d.id_number) = v_idnum)
        OR (v_name IS NOT NULL AND public.detention_norm(d.first_name || d.last_name) = v_name)
        OR (v_alias IS NOT NULL AND (
              public.detention_norm(d.alias) = v_alias
              OR public.detention_norm(d.first_name || d.last_name) = v_alias))
        OR (v_name IS NOT NULL AND public.detention_norm(d.alias) = v_name)
      )
  )
  SELECT m.* FROM matches m
  ORDER BY (m.severity = 'block') DESC, m.intake_at DESC NULLS LAST
  LIMIT 25;
END;
$$;

REVOKE ALL ON FUNCTION public.detention_find_duplicates(text, text, date, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detention_find_duplicates(text, text, date, text, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_detention(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_detention(uuid) TO authenticated, service_role;

-- Server-side safety net: never allow two open custody records for the same ID/passport.
CREATE OR REPLACE FUNCTION public.block_duplicate_detention_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idnum text := public.detention_norm(NEW.id_number);
  v_existing record;
BEGIN
  IF v_idnum IS NULL OR coalesce(NEW.id_type, '') ILIKE 'none' THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.status, 'in_custody') <> 'in_custody' THEN
    RETURN NEW;
  END IF;

  SELECT d.id, d.first_name, d.last_name, d.intake_at INTO v_existing
  FROM public.detention_records d
  WHERE d.id <> NEW.id
    AND d.status = 'in_custody'
    AND public.detention_norm(d.id_number) = v_idnum
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate intake blocked: % % (%) is already in custody with the same % number',
      v_existing.first_name, v_existing.last_name,
      to_char(v_existing.intake_at, 'DD Mon YYYY'), coalesce(nullif(NEW.id_type, ''), 'ID');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_duplicate_detention_intake ON public.detention_records;
CREATE TRIGGER trg_block_duplicate_detention_intake
BEFORE INSERT ON public.detention_records
FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_detention_intake();