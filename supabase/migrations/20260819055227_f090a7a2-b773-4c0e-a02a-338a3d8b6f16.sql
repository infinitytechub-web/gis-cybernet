ALTER TABLE public.patrol_logs
  ADD COLUMN IF NOT EXISTS odometer_start_km numeric,
  ADD COLUMN IF NOT EXISTS odometer_end_km numeric,
  ADD COLUMN IF NOT EXISTS fuel_used_litres numeric;

CREATE OR REPLACE FUNCTION public.patrol_log_vehicle_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.odometer_start_km IS NOT NULL AND NEW.odometer_start_km < 0 THEN
    RAISE EXCEPTION 'Odometer start reading cannot be negative';
  END IF;
  IF NEW.odometer_end_km IS NOT NULL AND NEW.odometer_end_km < 0 THEN
    RAISE EXCEPTION 'Odometer end reading cannot be negative';
  END IF;
  IF NEW.fuel_used_litres IS NOT NULL AND NEW.fuel_used_litres < 0 THEN
    RAISE EXCEPTION 'Fuel used cannot be negative';
  END IF;
  IF NEW.odometer_start_km IS NOT NULL AND NEW.odometer_end_km IS NOT NULL
     AND NEW.odometer_end_km < NEW.odometer_start_km THEN
    RAISE EXCEPTION 'Odometer end reading (%) cannot be lower than the start reading (%)',
      NEW.odometer_end_km, NEW.odometer_start_km;
  END IF;
  IF NEW.vehicle_id IS NULL AND (NEW.odometer_start_km IS NOT NULL
     OR NEW.odometer_end_km IS NOT NULL OR NEW.fuel_used_litres IS NOT NULL) THEN
    RAISE EXCEPTION 'Attach a vehicle before recording odometer or fuel usage';
  END IF;

  IF NEW.vehicle_id IS NOT NULL AND NEW.odometer_end_km IS NOT NULL THEN
    UPDATE public.fleet_vehicles
       SET odometer_km = GREATEST(odometer_km, floor(NEW.odometer_end_km)::int),
           updated_at = now()
     WHERE id = NEW.vehicle_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patrol_log_vehicle_usage ON public.patrol_logs;
CREATE TRIGGER trg_patrol_log_vehicle_usage
BEFORE INSERT OR UPDATE ON public.patrol_logs
FOR EACH ROW EXECUTE FUNCTION public.patrol_log_vehicle_usage();

CREATE OR REPLACE FUNCTION public.fleet_vehicle_usage(_days integer DEFAULT 30)
RETURNS TABLE (
  vehicle_id uuid,
  registration_number text,
  call_sign text,
  odometer_km integer,
  patrol_count bigint,
  patrol_distance_km numeric,
  patrol_fuel_litres numeric,
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