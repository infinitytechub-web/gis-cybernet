DROP FUNCTION IF EXISTS public.staff_mapping_rows();
DROP FUNCTION IF EXISTS public.duty_roster_live(date, text);

CREATE FUNCTION public.staff_mapping_rows()
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  rank_abbr text,
  department_name text,
  unit text,
  status text,
  shift_group text,
  photo_url text,
  org_unit_id uuid,
  org_unit_name text,
  station_name text,
  sector_name text,
  region_name text,
  latitude numeric,
  longitude numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE me AS (
    SELECT auth.uid() AS uid
  ),
  scope AS (
    SELECT uid,
      (public.is_command_tier(uid)
        OR public.has_role(uid, 'admin')
        OR public.has_role(uid, 'staff_officer')
        OR public.has_role(uid, 'head_of_administration')) AS see_all
    FROM me WHERE uid IS NOT NULL
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
    SELECT
      root_id,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type IN ('station','unit')))[1] AS r_station,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type = 'sector'))[1] AS r_sector,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type = 'regional'))[1] AS r_region,
      (ARRAY_AGG(node_lat ORDER BY depth) FILTER (WHERE node_lat IS NOT NULL))[1] AS r_lat,
      (ARRAY_AGG(node_lng ORDER BY depth) FILTER (WHERE node_lng IS NOT NULL))[1] AS r_lng
    FROM chain
    GROUP BY root_id
  )
  SELECT
    pr.id,
    pr.staff_id::text,
    TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name))::text,
    rk.name::text,
    rk.abbreviation::text,
    dp.name::text,
    pr.unit::text,
    pr.status::text,
    pr.shift_group::text,
    pr.photo_url::text,
    pr.org_unit_id,
    ou.name::text,
    res.r_station::text,
    res.r_sector::text,
    res.r_region::text,
    COALESCE(res.r_lat, cap.lat)::numeric,
    COALESCE(res.r_lng, cap.lng)::numeric
  FROM scope s
  CROSS JOIN public.profiles pr
  LEFT JOIN public.ranks rk ON rk.id = pr.rank_id
  LEFT JOIN public.departments dp ON dp.id = pr.department_id
  LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
  LEFT JOIN resolved res ON res.root_id = pr.org_unit_id
  LEFT JOIN LATERAL (
    SELECT g.lat, g.lng
    FROM public.ghana_regional_capitals g
    WHERE res.r_region IS NOT NULL
      AND REPLACE(LOWER(res.r_region), ' regional command', '') LIKE '%' || LOWER(g.region) || '%'
    LIMIT 1
  ) cap ON true
  WHERE s.see_all OR public.can_see_org_unit(s.uid, pr.org_unit_id);
$$;

REVOKE ALL ON FUNCTION public.staff_mapping_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mapping_rows() TO authenticated;

CREATE FUNCTION public.duty_roster_live(_date date DEFAULT CURRENT_DATE, _group text DEFAULT NULL)
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_abbr text,
  rank_name text,
  department_name text,
  unit text,
  shift_group text,
  status text,
  photo_url text,
  on_duty boolean,
  check_in timestamptz,
  check_out timestamptz,
  attendance_status text,
  org_unit_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id,
    pr.staff_id::text,
    TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name))::text,
    rk.abbreviation::text,
    rk.name::text,
    dp.name::text,
    pr.unit::text,
    pr.shift_group::text,
    pr.status::text,
    pr.photo_url::text,
    (_group IS NOT NULL AND UPPER(COALESCE(pr.shift_group, '')) = UPPER(_group)),
    att.check_in,
    att.check_out,
    att.status::text,
    ou.name::text
  FROM public.profiles pr
  LEFT JOIN public.ranks rk ON rk.id = pr.rank_id
  LEFT JOIN public.departments dp ON dp.id = pr.department_id
  LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
  LEFT JOIN public.attendances att ON att.profile_id = pr.id AND att.date = _date
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(pr.status::text, 'active') = 'active'
    AND pr.shift_group IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.duty_roster_live(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_roster_live(date, text) TO authenticated;