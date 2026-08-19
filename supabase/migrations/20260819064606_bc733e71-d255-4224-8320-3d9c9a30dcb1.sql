-- Extend per-vehicle usage rollup with engine hours used per patrol
DROP FUNCTION IF EXISTS public.fleet_vehicle_usage(integer);

CREATE FUNCTION public.fleet_vehicle_usage(_days integer DEFAULT 30)
RETURNS TABLE (
  vehicle_id uuid,
  registration_number text,
  call_sign text,
  odometer_km integer,
  patrol_count bigint,
  patrol_distance_km numeric,
  patrol_fuel_litres numeric,
  patrol_hours numeric,
  avg_hours_per_patrol numeric,
  km_per_hour numeric,
  litres_per_hour numeric,
  refuel_litres numeric,
  refuel_cost_ghs numeric,
  last_odometer_reading numeric,
  last_reading_at timestamptz,
  km_per_litre numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH since AS (
    SELECT (now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1)))::date AS d
  ),
  v AS (
    SELECT fv.id, fv.registration_number, fv.call_sign, fv.odometer_km, fv.org_unit_id
      FROM public.fleet_vehicles fv
     WHERE fv.org_unit_id IS NULL OR public.can_view_org_unit(auth.uid(), fv.org_unit_id)
  ),
  p AS (
    SELECT pl.vehicle_id,
           count(*) AS patrol_count,
           COALESCE(SUM(GREATEST(pl.odometer_end_km - pl.odometer_start_km, 0)), 0) AS distance_km,
           COALESCE(SUM(pl.fuel_used_litres), 0) AS fuel_litres,
           COALESCE(SUM(
             CASE
               WHEN pl.end_time IS NULL THEN NULL
               ELSE EXTRACT(epoch FROM (
                      CASE WHEN pl.end_time < pl.start_time
                           THEN pl.end_time + interval '24 hours'
                           ELSE pl.end_time END - pl.start_time)) / 3600.0
             END
           ), 0) AS hours,
           count(*) FILTER (WHERE pl.end_time IS NOT NULL) AS timed_patrols,
           MAX(pl.odometer_end_km) AS last_odo,
           MAX(pl.created_at) AS last_at
      FROM public.patrol_logs pl, since
     WHERE pl.vehicle_id IS NOT NULL AND pl.patrol_date >= since.d
     GROUP BY pl.vehicle_id
  ),
  f AS (
    SELECT fr.vehicle_id,
           COALESCE(SUM(CASE WHEN fr.event_type = 'refuel' THEN COALESCE(fr.delta_litres, fr.litres) END), 0) AS refuel_litres,
           COALESCE(SUM(fr.cost_ghs), 0) AS cost_ghs
      FROM public.fleet_fuel_readings fr, since
     WHERE fr.recorded_at >= since.d
     GROUP BY fr.vehicle_id
  )
  SELECT v.id,
         v.registration_number,
         v.call_sign,
         v.odometer_km,
         COALESCE(p.patrol_count, 0),
         ROUND(COALESCE(p.distance_km, 0)::numeric, 1),
         ROUND(COALESCE(p.fuel_litres, 0)::numeric, 1),
         ROUND(COALESCE(p.hours, 0)::numeric, 2),
         CASE WHEN COALESCE(p.timed_patrols, 0) > 0
              THEN ROUND((p.hours / p.timed_patrols)::numeric, 2) END,
         CASE WHEN COALESCE(p.hours, 0) > 0
              THEN ROUND((COALESCE(p.distance_km, 0) / p.hours)::numeric, 1) END,
         CASE WHEN COALESCE(p.hours, 0) > 0 AND COALESCE(p.fuel_litres, 0) > 0
              THEN ROUND((p.fuel_litres / p.hours)::numeric, 2) END,
         ROUND(COALESCE(f.refuel_litres, 0)::numeric, 1),
         ROUND(COALESCE(f.cost_ghs, 0)::numeric, 2),
         p.last_odo,
         p.last_at,
         CASE
           WHEN COALESCE(p.fuel_litres, 0) > 0 THEN ROUND((COALESCE(p.distance_km, 0) / p.fuel_litres)::numeric, 2)
           WHEN COALESCE(f.refuel_litres, 0) > 0 THEN ROUND((COALESCE(p.distance_km, 0) / f.refuel_litres)::numeric, 2)
           ELSE NULL
         END
    FROM v
    LEFT JOIN p ON p.vehicle_id = v.id
    LEFT JOIN f ON f.vehicle_id = v.id
   ORDER BY COALESCE(p.distance_km, 0) DESC, v.registration_number;
$$;

REVOKE ALL ON FUNCTION public.fleet_vehicle_usage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_vehicle_usage(integer) TO authenticated;