CREATE OR REPLACE FUNCTION public.attendance_hours_summary(_from date, _to date)
RETURNS TABLE(
  profile_id uuid,
  staff_name text,
  staff_id text,
  department text,
  days_present integer,
  days_late integer,
  days_absent integer,
  days_excused integer,
  open_sessions integer,
  hours_worked numeric,
  first_date date,
  last_date date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _all boolean;
  _me uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'Invalid date range.';
  END IF;

  _all := public.is_command_tier(auth.uid());
  SELECT p.id INTO _me FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  SELECT p.id AS profile_id,
         NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS staff_name,
         p.staff_id,
         d.name AS department,
         COUNT(*) FILTER (WHERE a.status = 'present')::int AS days_present,
         COUNT(*) FILTER (WHERE a.status = 'late')::int AS days_late,
         COUNT(*) FILTER (WHERE a.status = 'absent')::int AS days_absent,
         COUNT(*) FILTER (WHERE a.status = 'excused')::int AS days_excused,
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL)::int AS open_sessions,
         ROUND(COALESCE(SUM(
           CASE
             WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out > a.check_in
               THEN LEAST(EXTRACT(EPOCH FROM (a.check_out - a.check_in)) / 3600.0, 24)
             ELSE 0
           END
         ), 0)::numeric, 2) AS hours_worked,
         MIN(a.date) AS first_date,
         MAX(a.date) AS last_date
    FROM public.attendances a
    JOIN public.profiles p ON p.id = a.profile_id
    LEFT JOIN public.departments d ON d.id = p.department_id
   WHERE a.date BETWEEN _from AND _to
     AND (_all OR a.profile_id = _me)
   GROUP BY p.id, p.first_name, p.last_name, p.staff_id, d.name
   ORDER BY 10 DESC, 2 NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.attendance_hours_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_hours_summary(date, date) TO authenticated;