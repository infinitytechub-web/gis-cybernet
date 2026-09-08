ALTER TABLE public.leave_entitlements
  ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'days',
  ADD COLUMN IF NOT EXISTS value_min numeric,
  ADD COLUMN IF NOT EXISTS value_max numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_entitlements_grade_chk') THEN
    ALTER TABLE public.leave_entitlements
      ADD CONSTRAINT leave_entitlements_grade_chk CHECK (grade IN ('all','junior','senior'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_entitlements_unit_chk') THEN
    ALTER TABLE public.leave_entitlements
      ADD CONSTRAINT leave_entitlements_unit_chk CHECK (unit IN ('days','months','years'));
  END IF;
END $$;

ALTER TABLE public.leave_entitlements
  DROP CONSTRAINT IF EXISTS leave_entitlements_leave_type_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS leave_entitlements_type_year_grade_uidx
  ON public.leave_entitlements (leave_type, year, grade);

CREATE OR REPLACE FUNCTION public.leave_grade_of_profile(_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN COALESCE(r.level, 0) >= 7 THEN 'senior' ELSE 'junior' END
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  WHERE p.id = _profile_id;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_grade_of_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_grade_of_profile(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leave_entitlement_days(_profile_id uuid, _type public.leave_type, _year integer)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE e.unit WHEN 'years' THEN e.days * 365 WHEN 'months' THEN e.days * 30 ELSE e.days END
  FROM public.leave_entitlements e
  WHERE e.leave_type = _type
    AND e.year = _year
    AND e.grade IN ('all', COALESCE(public.leave_grade_of_profile(_profile_id), 'junior'))
  ORDER BY CASE WHEN e.grade = 'all' THEN 1 ELSE 0 END
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_entitlement_days(uuid, public.leave_type, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_entitlement_days(uuid, public.leave_type, integer) TO authenticated, service_role;

DO $$
DECLARE y integer;
BEGIN
  FOREACH y IN ARRAY ARRAY[EXTRACT(YEAR FROM now())::int, EXTRACT(YEAR FROM now())::int + 1]
  LOOP
    DELETE FROM public.leave_entitlements
    WHERE year = y AND grade = 'all' AND leave_type IN ('annual','study');

    INSERT INTO public.leave_entitlements (leave_type, year, grade, unit, days, notes)
    VALUES ('annual', y, 'junior', 'days', 28, 'Junior officers: 28 working days')
    ON CONFLICT (leave_type, year, grade) DO UPDATE
      SET days = EXCLUDED.days, unit = EXCLUDED.unit, notes = EXCLUDED.notes, updated_at = now();

    INSERT INTO public.leave_entitlements (leave_type, year, grade, unit, days, notes)
    VALUES ('annual', y, 'senior', 'days', 36, 'Senior officers: 36 working days')
    ON CONFLICT (leave_type, year, grade) DO UPDATE
      SET days = EXCLUDED.days, unit = EXCLUDED.unit, notes = EXCLUDED.notes, updated_at = now();

    INSERT INTO public.leave_entitlements (leave_type, year, grade, unit, days, notes)
    VALUES ('maternity', y, 'all', 'months', 3, '3 months maternity leave')
    ON CONFLICT (leave_type, year, grade) DO UPDATE
      SET days = EXCLUDED.days, unit = EXCLUDED.unit, notes = EXCLUDED.notes, updated_at = now();

    INSERT INTO public.leave_entitlements (leave_type, year, grade, unit, days, value_min, value_max, notes)
    VALUES ('study', y, 'junior', 'years', 4, 4, 4, 'Junior officers: 4 years')
    ON CONFLICT (leave_type, year, grade) DO UPDATE
      SET days = EXCLUDED.days, unit = EXCLUDED.unit, value_min = EXCLUDED.value_min,
          value_max = EXCLUDED.value_max, notes = EXCLUDED.notes, updated_at = now();

    INSERT INTO public.leave_entitlements (leave_type, year, grade, unit, days, value_min, value_max, notes)
    VALUES ('study', y, 'senior', 'years', 2, 1, 2, 'Senior officers: selectable 1-2 years')
    ON CONFLICT (leave_type, year, grade) DO UPDATE
      SET days = EXCLUDED.days, unit = EXCLUDED.unit, value_min = EXCLUDED.value_min,
          value_max = EXCLUDED.value_max, notes = EXCLUDED.notes, updated_at = now();
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_leave_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested numeric;
  allowed numeric;
BEGIN
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date';
  END IF;

  requested := (NEW.end_date - NEW.start_date) + 1;
  allowed := public.leave_entitlement_days(NEW.profile_id, NEW.type, EXTRACT(YEAR FROM NEW.start_date)::int);

  IF allowed IS NOT NULL AND requested > allowed THEN
    RAISE EXCEPTION 'Requested % day(s) of % leave exceeds the configured allowance of % day(s) for this officer grade', requested, NEW.type, allowed;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_leave_entitlement_trg ON public.leave_requests;
CREATE TRIGGER enforce_leave_entitlement_trg
BEFORE INSERT OR UPDATE OF start_date, end_date, type ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_entitlement();

CREATE OR REPLACE FUNCTION public.leave_balances(_year integer DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  department_name text,
  unit text,
  shift_group text,
  leave_type public.leave_type,
  days_entitled numeric,
  days_taken numeric,
  days_pending numeric,
  days_remaining numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT p.id, p.staff_id,
           btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) AS full_name,
           r.name AS rank_name, d.name AS department_name, p.unit, p.shift_group,
           CASE WHEN COALESCE(r.level, 0) >= 7 THEN 'senior' ELSE 'junior' END AS grade
    FROM public.profiles p
    LEFT JOIN public.ranks r ON r.id = p.rank_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE p.status = 'active'
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'oic')
        OR public.has_role(auth.uid(), '2ic')
        OR public.has_role(auth.uid(), 'staff_officer')
        OR public.has_role(auth.uid(), 'supervisor')
      )
  ),
  types AS (
    SELECT DISTINCT e.leave_type FROM public.leave_entitlements e WHERE e.year = _year
  ),
  used AS (
    SELECT lr.profile_id, lr.type,
           sum(CASE WHEN lr.status = 'approved'
                    THEN greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)
                    ELSE 0 END)::numeric AS taken,
           sum(CASE WHEN lr.status = 'pending'
                    THEN greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)
                    ELSE 0 END)::numeric AS pending
    FROM public.leave_requests lr
    WHERE lr.start_date <= make_date(_year,12,31)
      AND lr.end_date >= make_date(_year,1,1)
    GROUP BY lr.profile_id, lr.type
  )
  SELECT v.id, v.staff_id, v.full_name, v.rank_name, v.department_name, v.unit, v.shift_group,
         t.leave_type,
         coalesce(ent.entitled, 0),
         coalesce(u.taken, 0),
         coalesce(u.pending, 0),
         greatest(coalesce(ent.entitled, 0) - coalesce(u.taken, 0), 0)
  FROM visible v
  CROSS JOIN types t
  LEFT JOIN LATERAL (
    SELECT CASE e.unit WHEN 'years' THEN e.days * 365 WHEN 'months' THEN e.days * 30 ELSE e.days END AS entitled
    FROM public.leave_entitlements e
    WHERE e.leave_type = t.leave_type
      AND e.year = _year
      AND e.grade IN ('all', v.grade)
    ORDER BY CASE WHEN e.grade = 'all' THEN 1 ELSE 0 END
    LIMIT 1
  ) ent ON true
  LEFT JOIN used u ON u.profile_id = v.id AND u.type = t.leave_type
  ORDER BY v.full_name, t.leave_type;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_balances(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_balances(integer) TO authenticated;
