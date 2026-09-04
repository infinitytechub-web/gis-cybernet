CREATE OR REPLACE FUNCTION public.staff_mapping_rows()
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_all := public.is_command_tier(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'staff_officer')
        OR public.has_role(auth.uid(), 'head_of_administration');

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT u.id AS root_id, u.id, u.name, u.type, u.parent_id, u.latitude, u.longitude, 0 AS depth
    FROM public.org_units u
    UNION ALL
    SELECT c.root_id, p.id, p.name, p.type, p.parent_id, p.latitude, p.longitude, c.depth + 1
    FROM chain c
    JOIN public.org_units p ON p.id = c.parent_id
  ),
  resolved AS (
    SELECT
      root_id,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type IN ('station','unit')))[1] AS station_name,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type = 'sector'))[1] AS sector_name,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type = 'regional'))[1] AS region_name,
      (ARRAY_AGG(latitude ORDER BY depth) FILTER (WHERE latitude IS NOT NULL))[1] AS lat,
      (ARRAY_AGG(longitude ORDER BY depth) FILTER (WHERE longitude IS NOT NULL))[1] AS lng
    FROM chain
    GROUP BY root_id
  )
  SELECT
    p.id,
    p.staff_id::text,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name))::text,
    r.name::text,
    r.abbreviation::text,
    d.name::text,
    p.unit::text,
    p.status::text,
    p.shift_group::text,
    p.photo_url::text,
    p.org_unit_id,
    ou.name::text,
    res.station_name::text,
    res.sector_name::text,
    res.region_name::text,
    COALESCE(res.lat, cap.lat)::numeric,
    COALESCE(res.lng, cap.lng)::numeric
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.org_units ou ON ou.id = p.org_unit_id
  LEFT JOIN resolved res ON res.root_id = p.org_unit_id
  LEFT JOIN LATERAL (
    SELECT g.lat, g.lng
    FROM public.ghana_regional_capitals g
    WHERE res.region_name IS NOT NULL
      AND REPLACE(LOWER(res.region_name), ' regional command', '') LIKE '%' || LOWER(g.region) || '%'
    LIMIT 1
  ) cap ON true
  WHERE v_all OR public.can_see_org_unit(auth.uid(), p.org_unit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_mapping_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mapping_rows() TO authenticated;

CREATE OR REPLACE FUNCTION public.duty_roster_live(_date date DEFAULT CURRENT_DATE, _group text DEFAULT NULL)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.staff_id::text,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name))::text,
    r.abbreviation::text,
    r.name::text,
    d.name::text,
    p.unit::text,
    p.shift_group::text,
    p.status::text,
    p.photo_url::text,
    (_group IS NOT NULL AND UPPER(COALESCE(p.shift_group, '')) = UPPER(_group)),
    a.check_in,
    a.check_out,
    a.status::text,
    ou.name::text
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.org_units ou ON ou.id = p.org_unit_id
  LEFT JOIN public.attendances a ON a.profile_id = p.id AND a.date = _date
  WHERE COALESCE(p.status::text, 'active') = 'active'
    AND p.shift_group IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.duty_roster_live(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_roster_live(date, text) TO authenticated;