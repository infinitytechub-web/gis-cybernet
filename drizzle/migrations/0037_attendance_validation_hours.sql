DROP FUNCTION IF EXISTS public.attendance_validation(text,date,date);
CREATE FUNCTION public.attendance_validation(_period text, _from date, _to date)
RETURNS TABLE(period_start date, org_unit_id uuid, unit_name text, staff_count bigint, records bigint, present bigint, late bigint, absent bigint, excused bigint, checked_in bigint, checked_out bigint, missing_checkout bigint, invalid_times bigint, duplicates bigint, total_hours numeric, avg_hours numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH a AS (
    SELECT date_trunc(CASE WHEN _period IN ('day','week','month','quarter','year') THEN _period ELSE 'day' END, at.date)::date ps,
           p.org_unit_id ou, at.*,
           CASE WHEN at.check_in IS NOT NULL AND at.check_out IS NOT NULL AND at.check_out > at.check_in
                THEN extract(epoch FROM at.check_out - at.check_in)/3600.0 END hrs
    FROM attendances at JOIN profiles p ON p.id = at.profile_id AND p.deleted_at IS NULL
    WHERE at.date BETWEEN _from AND _to
  ), d AS (SELECT profile_id, date FROM a GROUP BY 1,2 HAVING count(*) > 1)
  SELECT a.ps, a.ou, coalesce(u.name,'Unassigned'), count(DISTINCT a.profile_id), count(*),
    count(*) FILTER (WHERE a.status='present'), count(*) FILTER (WHERE a.status='late'),
    count(*) FILTER (WHERE a.status='absent'), count(*) FILTER (WHERE a.status='excused'),
    count(a.check_in), count(a.check_out),
    count(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date < current_date),
    count(*) FILTER (WHERE a.check_out IS NOT NULL AND a.check_in IS NOT NULL AND a.check_out <= a.check_in),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM d WHERE d.profile_id=a.profile_id AND d.date=a.date)),
    round(coalesce(sum(a.hrs),0)::numeric,1), round(coalesce(avg(a.hrs),0)::numeric,1)
  FROM a LEFT JOIN org_units u ON u.id = a.ou
  GROUP BY 1,2,3 ORDER BY 1 DESC, 3;
$$;
REVOKE ALL ON FUNCTION public.attendance_validation(text,date,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_validation(text,date,date) TO authenticated;