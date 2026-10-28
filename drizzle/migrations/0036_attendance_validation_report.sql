CREATE OR REPLACE FUNCTION public.attendance_validation(_period text, _from date, _to date)
RETURNS TABLE(period_start date, org_unit_id uuid, unit_name text, staff_count bigint, records bigint, present bigint, late bigint, absent bigint, excused bigint, missing_checkout bigint, invalid_times bigint, duplicates bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH a AS (
    SELECT date_trunc(CASE WHEN _period IN ('day','week','month','quarter','year') THEN _period ELSE 'day' END, at.date)::date ps,
           p.org_unit_id ou, at.*
    FROM attendances at JOIN profiles p ON p.id = at.profile_id AND p.deleted_at IS NULL
    WHERE at.date BETWEEN _from AND _to
  ), d AS (SELECT profile_id, date, count(*) c FROM a GROUP BY 1,2 HAVING count(*) > 1)
  SELECT a.ps, a.ou, coalesce(u.name,'Unassigned'), count(DISTINCT a.profile_id), count(*),
    count(*) FILTER (WHERE a.status='present'), count(*) FILTER (WHERE a.status='late'),
    count(*) FILTER (WHERE a.status='absent'), count(*) FILTER (WHERE a.status='excused'),
    count(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date < current_date),
    count(*) FILTER (WHERE a.check_out IS NOT NULL AND a.check_in IS NOT NULL AND a.check_out < a.check_in),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM d WHERE d.profile_id=a.profile_id AND d.date=a.date))
  FROM a LEFT JOIN org_units u ON u.id = a.ou
  GROUP BY 1,2,3 ORDER BY 1 DESC, 3;
$$;
REVOKE ALL ON FUNCTION public.attendance_validation(text,date,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_validation(text,date,date) TO authenticated;