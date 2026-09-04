CREATE OR REPLACE FUNCTION public.leave_usage_by_location(_year integer DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS TABLE(
  region_name text,
  station_name text,
  leave_type text,
  approved_days numeric,
  pending_days numeric,
  staff_count integer,
  request_count integer,
  latitude numeric,
  longitude numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE scope AS (
    SELECT auth.uid() AS uid,
      (public.is_command_tier(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'staff_officer')
        OR public.has_role(auth.uid(), 'head_of_administration')) AS see_all
  ),
  chain AS (
    SELECT u.id AS root_id, u.id AS node_id, u.name AS node_name, u.type AS node_type,
           u.parent_id AS node_parent, u.latitude AS node_lat, u.longitude AS node_lng, 0 AS depth
    FROM public.org_units u
    UNION ALL
    SELECT c.root_id, pu.id, pu.name, pu.type, pu.parent_id, pu.latitude, pu.longitude, c.depth + 1
    FROM chain c
    JOIN public.org_units pu ON pu.id = c.node_parent
  ),
  resolved AS (
    SELECT root_id,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type IN ('station','unit')))[1] AS r_station,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type = 'regional'))[1] AS r_region,
      (ARRAY_AGG(node_lat ORDER BY depth) FILTER (WHERE node_lat IS NOT NULL))[1] AS r_lat,
      (ARRAY_AGG(node_lng ORDER BY depth) FILTER (WHERE node_lng IS NOT NULL))[1] AS r_lng
    FROM chain
    GROUP BY root_id
  ),
  visible AS (
    SELECT pr.id AS profile_id,
      COALESCE(res.r_region, 'Unassigned')::text AS region_name,
      COALESCE(res.r_station, ou.name, 'Unassigned')::text AS station_name,
      res.r_lat AS latitude,
      res.r_lng AS longitude
    FROM scope s
    CROSS JOIN public.profiles pr
    LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
    LEFT JOIN resolved res ON res.root_id = pr.org_unit_id
    WHERE s.uid IS NOT NULL
      AND (s.see_all OR pr.user_id = s.uid OR public.can_see_org_unit(s.uid, pr.org_unit_id))
  ),
  spans AS (
    SELECT lr.profile_id, lr.type::text AS leave_type, lr.status::text AS status,
      GREATEST(
        (LEAST(lr.end_date, make_date(_year, 12, 31)) - GREATEST(lr.start_date, make_date(_year, 1, 1)) + 1),
        0
      )::numeric AS days
    FROM public.leave_requests lr
    WHERE lr.start_date <= make_date(_year, 12, 31)
      AND lr.end_date >= make_date(_year, 1, 1)
  )
  SELECT v.region_name,
    v.station_name,
    sp.leave_type,
    COALESCE(SUM(sp.days) FILTER (WHERE sp.status = 'approved'), 0)::numeric,
    COALESCE(SUM(sp.days) FILTER (WHERE sp.status = 'pending'), 0)::numeric,
    COUNT(DISTINCT sp.profile_id)::int,
    COUNT(*)::int,
    MAX(v.latitude)::numeric,
    MAX(v.longitude)::numeric
  FROM visible v
  JOIN spans sp ON sp.profile_id = v.profile_id
  GROUP BY v.region_name, v.station_name, sp.leave_type;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_usage_by_location(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_usage_by_location(integer) TO authenticated;