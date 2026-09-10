-- Working-day counter: excludes weekends and public holidays (incl. recurring)
CREATE OR REPLACE FUNCTION public.leave_working_days(_start date, _end date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _start IS NULL OR _end IS NULL OR _end < _start THEN 0
    ELSE (
      SELECT count(*)::numeric
      FROM generate_series(_start, _end, interval '1 day') AS g(d)
      WHERE EXTRACT(ISODOW FROM g.d) < 6
        AND NOT EXISTS (
          SELECT 1 FROM public.holidays h
          WHERE h.date = g.d::date
             OR (h.recurring
                 AND EXTRACT(MONTH FROM h.date) = EXTRACT(MONTH FROM g.d)
                 AND EXTRACT(DAY FROM h.date) = EXTRACT(DAY FROM g.d))
        )
    )
  END;
$$;

-- Calendar-accurate entitlement span in days, measured from a given start date
CREATE OR REPLACE FUNCTION public.leave_entitlement_span_end(_profile_id uuid, _type leave_type, _year integer, _start date)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE e.unit
           WHEN 'years' THEN (_start + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 year'))::date - 1
           WHEN 'months' THEN (_start + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 month'))::date - 1
           ELSE NULL
         END
  FROM public.leave_entitlements e
  WHERE e.leave_type = _type
    AND e.year = _year
    AND e.grade IN ('all', COALESCE(public.leave_grade_of_profile(_profile_id), 'junior'))
  ORDER BY CASE WHEN e.grade = 'all' THEN 1 ELSE 0 END
  LIMIT 1;
$$;

-- Working-day allowance (only for entitlements configured in days)
CREATE OR REPLACE FUNCTION public.leave_entitlement_days(_profile_id uuid, _type leave_type, _year integer)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE e.unit
           WHEN 'years' THEN (((make_date(_year,1,1) + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 year'))::date - 1) - make_date(_year,1,1) + 1)::numeric
           WHEN 'months' THEN (((make_date(_year,1,1) + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 month'))::date - 1) - make_date(_year,1,1) + 1)::numeric
           ELSE e.days
         END
  FROM public.leave_entitlements e
  WHERE e.leave_type = _type
    AND e.year = _year
    AND e.grade IN ('all', COALESCE(public.leave_grade_of_profile(_profile_id), 'junior'))
  ORDER BY CASE WHEN e.grade = 'all' THEN 1 ELSE 0 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.enforce_leave_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ent record;
  requested numeric;
  allowed_end date;
BEGIN
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before the start date';
  END IF;

  SELECT e.unit, e.days, e.value_max
    INTO ent
  FROM public.leave_entitlements e
  WHERE e.leave_type = NEW.type
    AND e.year = EXTRACT(YEAR FROM NEW.start_date)::int
    AND e.grade IN ('all', COALESCE(public.leave_grade_of_profile(NEW.profile_id), 'junior'))
  ORDER BY CASE WHEN e.grade = 'all' THEN 1 ELSE 0 END
  LIMIT 1;

  IF ent IS NULL THEN
    RETURN NEW;
  END IF;

  IF ent.unit = 'days' THEN
    requested := public.leave_working_days(NEW.start_date, NEW.end_date);
    IF requested > ent.days THEN
      RAISE EXCEPTION 'Requested % working day(s) of % leave exceeds the configured allowance of % working day(s) for this officer grade', requested, NEW.type, ent.days;
    END IF;
  ELSE
    allowed_end := CASE ent.unit
      WHEN 'years' THEN (NEW.start_date + (COALESCE(ent.value_max, ent.days)::int * INTERVAL '1 year'))::date - 1
      WHEN 'months' THEN (NEW.start_date + (COALESCE(ent.value_max, ent.days)::int * INTERVAL '1 month'))::date - 1
    END;
    IF allowed_end IS NOT NULL AND NEW.end_date > allowed_end THEN
      RAISE EXCEPTION 'Requested % leave may not run past % (configured allowance of % %)', NEW.type, allowed_end, COALESCE(ent.value_max, ent.days), ent.unit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Balances: count working days for day-based entitlements, calendar days otherwise
CREATE OR REPLACE FUNCTION public.leave_balances(_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
RETURNS TABLE(profile_id uuid, staff_id text, full_name text, rank_name text, department_name text, unit text, shift_group text, leave_type leave_type, days_entitled numeric, days_taken numeric, days_pending numeric, days_remaining numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  ents AS (
    SELECT v.id AS profile_id, t.leave_type, e.unit AS ent_unit,
           CASE e.unit
             WHEN 'years' THEN (((make_date(_year,1,1) + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 year'))::date - 1) - make_date(_year,1,1) + 1)::numeric
             WHEN 'months' THEN (((make_date(_year,1,1) + (COALESCE(e.value_max, e.days)::int * INTERVAL '1 month'))::date - 1) - make_date(_year,1,1) + 1)::numeric
             ELSE e.days
           END AS entitled
    FROM visible v
    CROSS JOIN types t
    LEFT JOIN LATERAL (
      SELECT e2.unit, e2.days, e2.value_max
      FROM public.leave_entitlements e2
      WHERE e2.leave_type = t.leave_type
        AND e2.year = _year
        AND e2.grade IN ('all', v.grade)
      ORDER BY CASE WHEN e2.grade = 'all' THEN 1 ELSE 0 END
      LIMIT 1
    ) e ON true
  ),
  used AS (
    SELECT lr.profile_id, lr.type,
           sum(CASE WHEN lr.status = 'approved' THEN
                 CASE WHEN COALESCE(en.ent_unit,'days') = 'days'
                      THEN public.leave_working_days(greatest(lr.start_date, make_date(_year,1,1)), least(lr.end_date, make_date(_year,12,31)))
                      ELSE greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)::numeric END
               ELSE 0 END) AS taken,
           sum(CASE WHEN lr.status = 'pending' THEN
                 CASE WHEN COALESCE(en.ent_unit,'days') = 'days'
                      THEN public.leave_working_days(greatest(lr.start_date, make_date(_year,1,1)), least(lr.end_date, make_date(_year,12,31)))
                      ELSE greatest(least(lr.end_date, make_date(_year,12,31)) - greatest(lr.start_date, make_date(_year,1,1)) + 1, 0)::numeric END
               ELSE 0 END) AS pending
    FROM public.leave_requests lr
    LEFT JOIN ents en ON en.profile_id = lr.profile_id AND en.leave_type = lr.type
    WHERE lr.start_date <= make_date(_year,12,31)
      AND lr.end_date >= make_date(_year,1,1)
    GROUP BY lr.profile_id, lr.type
  )
  SELECT v.id, v.staff_id, v.full_name, v.rank_name, v.department_name, v.unit, v.shift_group,
         t.leave_type,
         coalesce(en.entitled, 0),
         coalesce(u.taken, 0),
         coalesce(u.pending, 0),
         greatest(coalesce(en.entitled, 0) - coalesce(u.taken, 0), 0)
  FROM visible v
  CROSS JOIN types t
  LEFT JOIN ents en ON en.profile_id = v.id AND en.leave_type = t.leave_type
  LEFT JOIN used u ON u.profile_id = v.id AND u.type = t.leave_type
  ORDER BY v.full_name, t.leave_type;
$$;

REVOKE ALL ON FUNCTION public.leave_working_days(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_working_days(date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_entitlement_span_end(uuid, leave_type, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_entitlement_span_end(uuid, leave_type, integer, date) TO authenticated, service_role;