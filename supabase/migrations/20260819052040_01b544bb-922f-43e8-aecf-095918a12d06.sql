CREATE OR REPLACE FUNCTION public.patrol_gps_activity(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  win_days integer := GREATEST(1, LEAST(COALESCE(_days, 30), 180));
  result jsonb;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorised to view fleet analytics';
  END IF;

  WITH logs AS (
    SELECT l.id,
           l.patrol_reference,
           l.patrol_date,
           l.start_time,
           l.end_time,
           l.district_id,
           l.district_name,
           l.patrol_type,
           l.status,
           l.incidents_count,
           l.personnel_count,
           l.vehicle_id,
           v.registration_number,
           v.call_sign,
           -- window: patrol date + times, rolling into the next day when end < start
           (l.patrol_date + COALESCE(l.start_time, TIME '00:00'))::timestamptz AS win_start,
           (l.patrol_date
              + COALESCE(l.end_time, TIME '23:59')
              + CASE WHEN l.end_time IS NOT NULL
                          AND l.start_time IS NOT NULL
                          AND l.end_time < l.start_time
                     THEN INTERVAL '1 day' ELSE INTERVAL '0' END)::timestamptz AS win_end
    FROM public.patrol_logs l
    LEFT JOIN public.fleet_vehicles v ON v.id = l.vehicle_id
    WHERE l.patrol_date >= (CURRENT_DATE - win_days)
  ),
  fixes AS (
    SELECT g.id AS log_id,
           p.lat, p.lng, p.recorded_at, p.speed_kph, p.odometer_km
    FROM logs g
    JOIN public.fleet_positions p
      ON p.vehicle_id = g.vehicle_id
     AND p.recorded_at >= g.win_start
     AND p.recorded_at <= g.win_end
    WHERE g.vehicle_id IS NOT NULL
  ),
  fix_districts AS (
    SELECT f.log_id,
           f.recorded_at,
           f.speed_kph,
           f.odometer_km,
           d.id AS district_id,
           d.name AS district_name
    FROM fixes f
    LEFT JOIN public.ghana_districts d
      ON f.lat BETWEEN d.min_lat AND d.max_lat
     AND f.lng BETWEEN d.min_lng AND d.max_lng
     AND (d.polygon IS NULL OR public.fleet_point_in_polygon(f.lat, f.lng, d.polygon))
  ),
  gps AS (
    SELECT log_id,
           COUNT(*) AS fix_count,
           MIN(recorded_at) AS first_fix,
           MAX(recorded_at) AS last_fix,
           ROUND(MAX(COALESCE(speed_kph, 0))::numeric, 1) AS max_speed_kph,
           ROUND(GREATEST(COALESCE(MAX(odometer_km) - MIN(odometer_km), 0), 0)::numeric, 1) AS distance_km,
           COUNT(DISTINCT district_id) AS districts_seen,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT district_name), NULL) AS district_names,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT district_id::text), NULL) AS district_ids
    FROM fix_districts
    GROUP BY log_id
  )
  SELECT jsonb_build_object(
    'days', win_days,
    'as_of', now(),
    'patrols', COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.patrol_date DESC, x.start_time DESC NULLS LAST), '[]'::jsonb)
  )
  INTO result
  FROM (
    SELECT l.id,
           l.patrol_reference,
           l.patrol_date,
           l.start_time,
           l.end_time,
           l.patrol_type,
           l.status,
           l.incidents_count,
           l.personnel_count,
           l.district_name AS logged_district,
           l.vehicle_id,
           l.registration_number,
           l.call_sign,
           l.win_start,
           l.win_end,
           COALESCE(g.fix_count, 0) AS fix_count,
           g.first_fix,
           g.last_fix,
           COALESCE(g.max_speed_kph, 0) AS max_speed_kph,
           COALESCE(g.distance_km, 0) AS distance_km,
           COALESCE(g.district_names, ARRAY[]::text[]) AS gps_districts,
           COALESCE(g.district_ids, ARRAY[]::text[]) AS gps_district_ids,
           CASE
             WHEN l.vehicle_id IS NULL THEN 'no_vehicle'
             WHEN COALESCE(g.fix_count, 0) = 0 THEN 'no_gps'
             WHEN l.district_id IS NOT NULL
                  AND l.district_id::text = ANY (COALESCE(g.district_ids, ARRAY[]::text[])) THEN 'confirmed'
             WHEN l.district_name IS NOT NULL
                  AND l.district_name = ANY (COALESCE(g.district_names, ARRAY[]::text[])) THEN 'confirmed'
             ELSE 'mismatch'
           END AS gps_match
    FROM logs l
    LEFT JOIN gps g ON g.log_id = l.id
  ) x;

  RETURN COALESCE(result, jsonb_build_object('days', win_days, 'as_of', now(), 'patrols', '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.patrol_gps_activity(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patrol_gps_activity(integer) TO authenticated;