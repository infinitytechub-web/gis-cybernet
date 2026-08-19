-- ============================================================
-- Ghana district register + district-backed fleet patrol zones
-- ============================================================

CREATE TABLE public.ghana_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  region text NOT NULL,
  category text NOT NULL DEFAULT 'District',
  centroid_lat double precision NOT NULL,
  centroid_lng double precision NOT NULL,
  min_lat double precision NOT NULL,
  max_lat double precision NOT NULL,
  min_lng double precision NOT NULL,
  max_lng double precision NOT NULL,
  polygon jsonb NOT NULL,
  source text NOT NULL DEFAULT 'geoBoundaries gbOpen GHA ADM2',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ghana_districts TO authenticated;
GRANT ALL ON public.ghana_districts TO service_role;

ALTER TABLE public.ghana_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can read Ghana districts"
  ON public.ghana_districts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage the Ghana district register"
  ON public.ghana_districts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ghana_districts_region ON public.ghana_districts (region);
CREATE INDEX idx_ghana_districts_name ON public.ghana_districts (lower(name));

CREATE TRIGGER trg_ghana_districts_updated_at
  BEFORE UPDATE ON public.ghana_districts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Link zones to districts and cache a bounding box ────────────────────────
ALTER TABLE public.fleet_geofences
  ADD COLUMN district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  ADD COLUMN min_lat double precision,
  ADD COLUMN max_lat double precision,
  ADD COLUMN min_lng double precision,
  ADD COLUMN max_lng double precision;

CREATE UNIQUE INDEX idx_fleet_geofences_district ON public.fleet_geofences (district_id)
  WHERE district_id IS NOT NULL;

-- Validation now also maintains the bounding box used to skip far-away zones.
CREATE OR REPLACE FUNCTION public.fleet_validate_geofence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  lat_pad double precision;
  lng_pad double precision;
  pts jsonb;
BEGIN
  IF NEW.kind = 'circle' THEN
    IF NEW.center_lat IS NULL OR NEW.center_lng IS NULL OR COALESCE(NEW.radius_m, 0) <= 0 THEN
      RAISE EXCEPTION 'A circular zone needs a centre point and a radius greater than zero';
    END IF;
    lat_pad := (NEW.radius_m / 111320.0);
    lng_pad := (NEW.radius_m / GREATEST(111320.0 * cos(radians(NEW.center_lat)), 1));
    NEW.min_lat := NEW.center_lat - lat_pad;
    NEW.max_lat := NEW.center_lat + lat_pad;
    NEW.min_lng := NEW.center_lng - lng_pad;
    NEW.max_lng := NEW.center_lng + lng_pad;
  ELSE
    IF NEW.polygon IS NULL OR jsonb_typeof(NEW.polygon) <> 'array' OR jsonb_array_length(NEW.polygon) < 3 THEN
      RAISE EXCEPTION 'A polygon zone needs at least three points';
    END IF;
    pts := NEW.polygon;
    SELECT min((p -> 0)::text::double precision), max((p -> 0)::text::double precision),
           min((p -> 1)::text::double precision), max((p -> 1)::text::double precision)
      INTO NEW.min_lat, NEW.max_lat, NEW.min_lng, NEW.max_lng
      FROM jsonb_array_elements(pts) AS p;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill boxes for the zones that already exist.
UPDATE public.fleet_geofences SET updated_at = updated_at;

-- ── Live tracking: skip zones whose box cannot contain the position ─────────
CREATE OR REPLACE FUNCTION public.fleet_process_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.fleet_vehicles;
  g public.fleet_geofences;
  was_inside boolean;
  is_inside boolean;
  prev_fuel numeric;
  drop_pct numeric;
  new_alert_id uuid;
  ev text;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = NEW.vehicle_id;
  IF v.id IS NULL THEN RETURN NEW; END IF;

  prev_fuel := v.last_fuel_level_pct;

  UPDATE public.fleet_vehicles SET
    last_lat = NEW.lat,
    last_lng = NEW.lng,
    last_speed_kph = NEW.speed_kph,
    last_heading = NEW.heading,
    last_ignition = NEW.ignition,
    last_door_open = COALESCE(NEW.door_open, last_door_open),
    last_boot_open = COALESCE(NEW.boot_open, last_boot_open),
    last_fuel_level_pct = COALESCE(NEW.fuel_level_pct, last_fuel_level_pct),
    odometer_km = GREATEST(COALESCE(NEW.odometer_km, 0), odometer_km),
    last_seen_at = NEW.recorded_at
  WHERE id = NEW.vehicle_id;

  -- door / boot sensors: alert on an opening transition that looks unsafe
  IF NEW.door_open IS TRUE AND COALESCE(v.last_door_open, false) IS FALSE THEN
    IF COALESCE(NEW.speed_kph, 0) > 5 OR NEW.ignition IS FALSE THEN
      INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, speed_kph, occurred_at, metadata)
      VALUES (NEW.vehicle_id, 'door_open',
        (CASE WHEN COALESCE(NEW.speed_kph, 0) > 5 THEN 'critical' ELSE 'warning' END)::public.fleet_alert_severity,
        v.registration_number || ' door opened ' ||
        CASE WHEN COALESCE(NEW.speed_kph, 0) > 5
          THEN 'while moving at ' || round(NEW.speed_kph) || ' km/h'
          ELSE 'with the ignition off' END,
        NEW.lat, NEW.lng, NEW.speed_kph, NEW.recorded_at,
        jsonb_build_object('sensor', 'door', 'ignition', NEW.ignition));
    END IF;
  END IF;

  IF NEW.boot_open IS TRUE AND COALESCE(v.last_boot_open, false) IS FALSE THEN
    INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, speed_kph, occurred_at, metadata)
    VALUES (NEW.vehicle_id, 'boot_open',
      (CASE WHEN COALESCE(NEW.speed_kph, 0) > 5 THEN 'critical' ELSE 'warning' END)::public.fleet_alert_severity,
      v.registration_number || ' boot opened' ||
      CASE WHEN COALESCE(NEW.speed_kph, 0) > 5
        THEN ' while moving at ' || round(NEW.speed_kph) || ' km/h' ELSE '' END,
      NEW.lat, NEW.lng, NEW.speed_kph, NEW.recorded_at,
      jsonb_build_object('sensor', 'boot', 'ignition', NEW.ignition));
  END IF;

  -- speeding
  IF NEW.speed_kph IS NOT NULL AND NEW.speed_kph > v.speed_limit_kph THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.fleet_alerts
      WHERE vehicle_id = NEW.vehicle_id AND alert_type = 'speeding'
        AND occurred_at > NEW.recorded_at - interval '10 minutes'
    ) THEN
      INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, speed_kph, occurred_at, metadata)
      VALUES (NEW.vehicle_id, 'speeding', 'warning',
        v.registration_number || ' exceeded its speed limit (' || round(NEW.speed_kph) || ' km/h in a ' || v.speed_limit_kph || ' km/h limit)',
        NEW.lat, NEW.lng, NEW.speed_kph, NEW.recorded_at,
        jsonb_build_object('limit_kph', v.speed_limit_kph));
    END IF;
  END IF;

  -- fuel level / theft detection
  IF NEW.fuel_level_pct IS NOT NULL THEN
    INSERT INTO public.fleet_fuel_readings (vehicle_id, recorded_at, event_type, level_pct, litres, odometer_km, lat, lng)
    VALUES (NEW.vehicle_id, NEW.recorded_at, 'reading', NEW.fuel_level_pct,
      CASE WHEN v.fuel_capacity_litres IS NOT NULL THEN round((NEW.fuel_level_pct / 100.0) * v.fuel_capacity_litres, 2) END,
      NEW.odometer_km, NEW.lat, NEW.lng);

    IF prev_fuel IS NOT NULL THEN
      drop_pct := prev_fuel - NEW.fuel_level_pct;
      IF drop_pct >= v.fuel_drop_threshold_pct THEN
        INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, fuel_level_pct, occurred_at, metadata)
        VALUES (NEW.vehicle_id, 'fuel_drop', 'critical',
          v.registration_number || ' lost ' || round(drop_pct, 1) || '% fuel since the previous reading — possible siphoning',
          NEW.lat, NEW.lng, NEW.fuel_level_pct, NEW.recorded_at,
          jsonb_build_object('previous_pct', prev_fuel, 'drop_pct', round(drop_pct, 2)));
      ELSIF drop_pct <= -5 THEN
        INSERT INTO public.fleet_fuel_readings (vehicle_id, recorded_at, event_type, level_pct, delta_litres, odometer_km, lat, lng, notes)
        VALUES (NEW.vehicle_id, NEW.recorded_at, 'refuel', NEW.fuel_level_pct,
          CASE WHEN v.fuel_capacity_litres IS NOT NULL THEN round((-drop_pct / 100.0) * v.fuel_capacity_litres, 2) END,
          NEW.odometer_km, NEW.lat, NEW.lng, 'Detected automatically from tracker fuel level');
      END IF;
    END IF;

    IF NEW.fuel_level_pct <= v.low_fuel_threshold_pct
       AND NOT EXISTS (
         SELECT 1 FROM public.fleet_alerts
         WHERE vehicle_id = NEW.vehicle_id AND alert_type = 'fuel_low'
           AND occurred_at > NEW.recorded_at - interval '6 hours'
       ) THEN
      INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, fuel_level_pct, occurred_at)
      VALUES (NEW.vehicle_id, 'fuel_low', 'warning',
        v.registration_number || ' is low on fuel (' || round(NEW.fuel_level_pct) || '%)',
        NEW.lat, NEW.lng, NEW.fuel_level_pct, NEW.recorded_at);
    END IF;
  END IF;

  -- geofencing: the bounding box filter keeps this cheap with hundreds of
  -- district zones — only zones whose box covers this position or the previous
  -- one can produce a crossing.
  FOR g IN
    SELECT * FROM public.fleet_geofences
    WHERE active
      AND (
        min_lat IS NULL
        OR (NEW.lat BETWEEN min_lat AND max_lat AND NEW.lng BETWEEN min_lng AND max_lng)
        OR (v.last_lat IS NOT NULL AND v.last_lng IS NOT NULL
            AND v.last_lat BETWEEN min_lat AND max_lat
            AND v.last_lng BETWEEN min_lng AND max_lng)
      )
  LOOP
    is_inside := public.fleet_geofence_contains(g, NEW.lat, NEW.lng);
    was_inside := CASE
      WHEN v.last_lat IS NULL OR v.last_lng IS NULL THEN NULL
      ELSE public.fleet_geofence_contains(g, v.last_lat, v.last_lng)
    END;

    IF was_inside IS NULL OR was_inside = is_inside THEN CONTINUE; END IF;
    ev := CASE WHEN is_inside THEN 'enter' ELSE 'exit' END;
    IF g.trigger_on <> 'both' AND g.trigger_on::text <> ev THEN CONTINUE; END IF;

    INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, geofence_id, lat, lng, speed_kph, occurred_at)
    VALUES (NEW.vehicle_id,
      (CASE WHEN is_inside THEN 'geofence_enter' ELSE 'geofence_exit' END)::public.fleet_alert_type,
      g.severity,
      v.registration_number || CASE WHEN is_inside THEN ' entered ' ELSE ' left ' END || g.name,
      g.id, NEW.lat, NEW.lng, NEW.speed_kph, NEW.recorded_at)
    RETURNING id INTO new_alert_id;

    INSERT INTO public.fleet_geofence_events (vehicle_id, geofence_id, event_type, occurred_at, lat, lng, alert_id)
    VALUES (NEW.vehicle_id, g.id, ev, NEW.recorded_at, NEW.lat, NEW.lng, new_alert_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ── Promote official districts into patrol zones ────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_activate_district_zones(
  _district_ids uuid[],
  _org_unit_id uuid DEFAULT NULL,
  _trigger text DEFAULT 'both',
  _severity text DEFAULT 'info'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.ghana_districts;
  affected integer := 0;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorised to manage patrol zones';
  END IF;
  IF _district_ids IS NULL OR array_length(_district_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR d IN SELECT * FROM public.ghana_districts WHERE id = ANY(_district_ids) LOOP
    INSERT INTO public.fleet_geofences (
      name, description, kind, polygon, trigger_on, severity, active,
      org_unit_id, district_id, created_by
    ) VALUES (
      d.name || ' District',
      d.region || ' · official district boundary patrol area',
      'polygon', d.polygon,
      _trigger::public.fleet_geofence_trigger,
      _severity::public.fleet_alert_severity,
      true, _org_unit_id, d.id, auth.uid()
    )
    ON CONFLICT (district_id) WHERE district_id IS NOT NULL
    DO UPDATE SET
      active = true,
      polygon = EXCLUDED.polygon,
      trigger_on = EXCLUDED.trigger_on,
      severity = EXCLUDED.severity,
      org_unit_id = COALESCE(EXCLUDED.org_unit_id, public.fleet_geofences.org_unit_id),
      updated_at = now();
    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_deactivate_district_zones(_district_ids uuid[], _delete boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected integer := 0;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorised to manage patrol zones';
  END IF;
  IF _district_ids IS NULL OR array_length(_district_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF _delete THEN
    DELETE FROM public.fleet_geofences WHERE district_id = ANY(_district_ids);
  ELSE
    UPDATE public.fleet_geofences SET active = false, updated_at = now()
    WHERE district_id = ANY(_district_ids);
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_activate_district_zones(uuid[], uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_deactivate_district_zones(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_activate_district_zones(uuid[], uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_deactivate_district_zones(uuid[], boolean) TO authenticated;