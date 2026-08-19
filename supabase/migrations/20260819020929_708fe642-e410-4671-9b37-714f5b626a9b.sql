-- ══════════════════════════════════════════════════════════════════════════
-- FLEET MANAGEMENT: vehicles, tracking, geofencing, panic/SOS, fuel
-- ══════════════════════════════════════════════════════════════════════════

CREATE TYPE public.fleet_vehicle_status AS ENUM ('active', 'maintenance', 'grounded', 'decommissioned');
CREATE TYPE public.fleet_alert_type AS ENUM ('panic', 'geofence_enter', 'geofence_exit', 'speeding', 'fuel_drop', 'fuel_low', 'device_offline', 'ignition_on', 'harsh_driving');
CREATE TYPE public.fleet_alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.fleet_alert_status AS ENUM ('new', 'acknowledged', 'resolved', 'dismissed');
CREATE TYPE public.fleet_geofence_kind AS ENUM ('circle', 'polygon');
CREATE TYPE public.fleet_geofence_trigger AS ENUM ('enter', 'exit', 'both');
CREATE TYPE public.fleet_fuel_event AS ENUM ('reading', 'refuel', 'drain');

-- ── Authority helper ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_fleet(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_command_tier(_user_id)
      OR public.has_role(_user_id, 'special_duties')
      OR public.has_command_capability(_user_id, 'fleet');
$$;

-- ── Vehicles ──────────────────────────────────────────────────────────────
CREATE TABLE public.fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  call_sign text,
  make text,
  model text,
  model_year int,
  vehicle_type text NOT NULL DEFAULT 'patrol',
  status public.fleet_vehicle_status NOT NULL DEFAULT 'active',
  device_id text UNIQUE,
  fuel_capacity_litres numeric(8,2),
  odometer_km numeric(12,2) NOT NULL DEFAULT 0,
  speed_limit_kph int NOT NULL DEFAULT 80,
  low_fuel_threshold_pct int NOT NULL DEFAULT 20,
  fuel_drop_threshold_pct int NOT NULL DEFAULT 12,
  assigned_driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  last_lat double precision,
  last_lng double precision,
  last_speed_kph numeric(6,2),
  last_heading numeric(6,2),
  last_ignition boolean,
  last_fuel_level_pct numeric(6,2),
  last_seen_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet managers view all vehicles" ON public.fleet_vehicles
FOR SELECT TO authenticated USING (
  public.can_manage_fleet(auth.uid())
  OR assigned_driver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Fleet managers add vehicles" ON public.fleet_vehicles
FOR INSERT TO authenticated WITH CHECK (public.can_manage_fleet(auth.uid()));
CREATE POLICY "Fleet managers update vehicles" ON public.fleet_vehicles
FOR UPDATE TO authenticated USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));
CREATE POLICY "Admins delete vehicles" ON public.fleet_vehicles
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_fleet_vehicles_updated_at BEFORE UPDATE ON public.fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Tracker ingest keys (hashed, never readable) ───────────────────────────
CREATE TABLE public.fleet_ingest_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_ingest_keys TO authenticated;
GRANT ALL ON public.fleet_ingest_keys TO service_role;
ALTER TABLE public.fleet_ingest_keys ENABLE ROW LEVEL SECURITY;

-- key_hash is protected from the Data API by a column-level revoke below
CREATE POLICY "Admins manage ingest keys" ON public.fleet_ingest_keys
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE SELECT (key_hash) ON public.fleet_ingest_keys FROM authenticated;

CREATE TRIGGER trg_fleet_ingest_keys_updated_at BEFORE UPDATE ON public.fleet_ingest_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Geofences ─────────────────────────────────────────────────────────────
CREATE TABLE public.fleet_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind public.fleet_geofence_kind NOT NULL DEFAULT 'circle',
  center_lat double precision,
  center_lng double precision,
  radius_m numeric(10,2),
  polygon jsonb,
  trigger_on public.fleet_geofence_trigger NOT NULL DEFAULT 'both',
  severity public.fleet_alert_severity NOT NULL DEFAULT 'warning',
  active boolean NOT NULL DEFAULT true,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_geofences TO authenticated;
GRANT ALL ON public.fleet_geofences TO service_role;
ALTER TABLE public.fleet_geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with fleet access view geofences" ON public.fleet_geofences
FOR SELECT TO authenticated USING (public.can_manage_fleet(auth.uid()));
CREATE POLICY "Fleet managers write geofences" ON public.fleet_geofences
FOR INSERT TO authenticated WITH CHECK (public.can_manage_fleet(auth.uid()));
CREATE POLICY "Fleet managers edit geofences" ON public.fleet_geofences
FOR UPDATE TO authenticated USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));
CREATE POLICY "Fleet managers remove geofences" ON public.fleet_geofences
FOR DELETE TO authenticated USING (public.can_manage_fleet(auth.uid()));

CREATE TRIGGER trg_fleet_geofences_updated_at BEFORE UPDATE ON public.fleet_geofences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- validation (time/data dependent rules live in triggers, not CHECKs)
CREATE OR REPLACE FUNCTION public.fleet_validate_geofence()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'circle' THEN
    IF NEW.center_lat IS NULL OR NEW.center_lng IS NULL OR COALESCE(NEW.radius_m, 0) <= 0 THEN
      RAISE EXCEPTION 'A circular zone needs a centre point and a radius greater than zero';
    END IF;
  ELSE
    IF NEW.polygon IS NULL OR jsonb_typeof(NEW.polygon) <> 'array' OR jsonb_array_length(NEW.polygon) < 3 THEN
      RAISE EXCEPTION 'A polygon zone needs at least three points';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fleet_validate_geofence BEFORE INSERT OR UPDATE ON public.fleet_geofences
FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_geofence();

-- ── Positions ─────────────────────────────────────────────────────────────
CREATE TABLE public.fleet_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed_kph numeric(6,2),
  heading numeric(6,2),
  altitude_m numeric(8,2),
  ignition boolean,
  odometer_km numeric(12,2),
  fuel_level_pct numeric(6,2),
  satellites int,
  source text NOT NULL DEFAULT 'device',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fleet_positions_vehicle_time ON public.fleet_positions (vehicle_id, recorded_at DESC);

GRANT SELECT ON public.fleet_positions TO authenticated;
GRANT ALL ON public.fleet_positions TO service_role;
ALTER TABLE public.fleet_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet viewers read positions" ON public.fleet_positions
FOR SELECT TO authenticated USING (
  public.can_manage_fleet(auth.uid())
  OR vehicle_id IN (
    SELECT v.id FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE p.user_id = auth.uid()
  )
);

-- ── Fuel readings ─────────────────────────────────────────────────────────
CREATE TABLE public.fleet_fuel_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_type public.fleet_fuel_event NOT NULL DEFAULT 'reading',
  level_pct numeric(6,2),
  litres numeric(10,2),
  delta_litres numeric(10,2),
  odometer_km numeric(12,2),
  cost_ghs numeric(12,2),
  lat double precision,
  lng double precision,
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fleet_fuel_vehicle_time ON public.fleet_fuel_readings (vehicle_id, recorded_at DESC);

GRANT SELECT, INSERT ON public.fleet_fuel_readings TO authenticated;
GRANT ALL ON public.fleet_fuel_readings TO service_role;
ALTER TABLE public.fleet_fuel_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet viewers read fuel" ON public.fleet_fuel_readings
FOR SELECT TO authenticated USING (
  public.can_manage_fleet(auth.uid())
  OR vehicle_id IN (
    SELECT v.id FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE p.user_id = auth.uid()
  )
);
CREATE POLICY "Fleet managers log refuels" ON public.fleet_fuel_readings
FOR INSERT TO authenticated WITH CHECK (
  public.can_manage_fleet(auth.uid()) AND event_type <> 'reading'
);

-- ── Alerts (incl. panic/SOS) ──────────────────────────────────────────────
CREATE TABLE public.fleet_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  alert_type public.fleet_alert_type NOT NULL,
  severity public.fleet_alert_severity NOT NULL DEFAULT 'warning',
  status public.fleet_alert_status NOT NULL DEFAULT 'new',
  message text NOT NULL,
  geofence_id uuid REFERENCES public.fleet_geofences(id) ON DELETE SET NULL,
  lat double precision,
  lng double precision,
  speed_kph numeric(6,2),
  fuel_level_pct numeric(6,2),
  raised_by uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fleet_alerts_status_time ON public.fleet_alerts (status, occurred_at DESC);
CREATE INDEX idx_fleet_alerts_vehicle_time ON public.fleet_alerts (vehicle_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.fleet_alerts TO authenticated;
GRANT ALL ON public.fleet_alerts TO service_role;
ALTER TABLE public.fleet_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet viewers read alerts" ON public.fleet_alerts
FOR SELECT TO authenticated USING (
  public.can_manage_fleet(auth.uid())
  OR raised_by = auth.uid()
  OR vehicle_id IN (
    SELECT v.id FROM public.fleet_vehicles v
    JOIN public.profiles p ON p.id = v.assigned_driver_id
    WHERE p.user_id = auth.uid()
  )
);
-- any staff member may raise a panic/SOS for a vehicle they are assigned to
CREATE POLICY "Staff raise panic alerts" ON public.fleet_alerts
FOR INSERT TO authenticated WITH CHECK (
  raised_by = auth.uid()
  AND alert_type = 'panic'
);
CREATE POLICY "Fleet managers handle alerts" ON public.fleet_alerts
FOR UPDATE TO authenticated USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE TRIGGER trg_fleet_alerts_updated_at BEFORE UPDATE ON public.fleet_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Geofence events ───────────────────────────────────────────────────────
CREATE TABLE public.fleet_geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  geofence_id uuid NOT NULL REFERENCES public.fleet_geofences(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  alert_id uuid REFERENCES public.fleet_alerts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fleet_geofence_events_time ON public.fleet_geofence_events (vehicle_id, occurred_at DESC);

GRANT SELECT ON public.fleet_geofence_events TO authenticated;
GRANT ALL ON public.fleet_geofence_events TO service_role;
ALTER TABLE public.fleet_geofence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet viewers read geofence events" ON public.fleet_geofence_events
FOR SELECT TO authenticated USING (public.can_manage_fleet(auth.uid()));

-- ── Geometry helpers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_distance_m(_lat1 double precision, _lng1 double precision, _lat2 double precision, _lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians(_lat2 - _lat1) / 2), 2)
    + cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)
  ));
$$;

CREATE OR REPLACE FUNCTION public.fleet_point_in_polygon(_lat double precision, _lng double precision, _polygon jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  n int;
  i int;
  j int;
  yi double precision; xi double precision; yj double precision; xj double precision;
  inside boolean := false;
BEGIN
  IF _polygon IS NULL OR jsonb_typeof(_polygon) <> 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(_polygon);
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  FOR i IN 0..n - 1 LOOP
    yi := (_polygon -> i -> 0)::text::double precision;  -- [lat, lng]
    xi := (_polygon -> i -> 1)::text::double precision;
    yj := (_polygon -> j -> 0)::text::double precision;
    xj := (_polygon -> j -> 1)::text::double precision;
    IF ((yi > _lat) <> (yj > _lat))
       AND (_lng < (xj - xi) * (_lat - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;
  RETURN inside;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_geofence_contains(_geofence public.fleet_geofences, _lat double precision, _lng double precision)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _geofence.kind = 'circle' THEN
      public.fleet_distance_m(_geofence.center_lat, _geofence.center_lng, _lat, _lng) <= COALESCE(_geofence.radius_m, 0)
    ELSE public.fleet_point_in_polygon(_lat, _lng, _geofence.polygon)
  END;
$$;

-- ── Real-time processing of every incoming position ───────────────────────
CREATE OR REPLACE FUNCTION public.fleet_process_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- keep last-known state current for the live map
  UPDATE public.fleet_vehicles SET
    last_lat = NEW.lat,
    last_lng = NEW.lng,
    last_speed_kph = NEW.speed_kph,
    last_heading = NEW.heading,
    last_ignition = NEW.ignition,
    last_fuel_level_pct = COALESCE(NEW.fuel_level_pct, last_fuel_level_pct),
    odometer_km = GREATEST(COALESCE(NEW.odometer_km, 0), odometer_km),
    last_seen_at = NEW.recorded_at
  WHERE id = NEW.vehicle_id;

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

  -- geofencing
  FOR g IN SELECT * FROM public.fleet_geofences WHERE active LOOP
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
$$;

CREATE TRIGGER trg_fleet_process_position AFTER INSERT ON public.fleet_positions
FOR EACH ROW EXECUTE FUNCTION public.fleet_process_position();

-- ── Panic / SOS ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_raise_panic(
  _vehicle_id uuid,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.fleet_vehicles;
  me uuid := auth.uid();
  allowed boolean;
  alert_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = _vehicle_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Vehicle not found'; END IF;

  SELECT public.can_manage_fleet(me)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.assigned_driver_id AND p.user_id = me)
    INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'You are not authorised to raise an emergency for this vehicle'; END IF;

  INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng, raised_by, metadata)
  VALUES (_vehicle_id, 'panic', 'critical',
    'PANIC / SOS raised for ' || v.registration_number || COALESCE(' — ' || _note, ''),
    COALESCE(_lat, v.last_lat), COALESCE(_lng, v.last_lng), me,
    jsonb_build_object('note', _note))
  RETURNING id INTO alert_id;

  RETURN alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_raise_panic(uuid, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_raise_panic(uuid, double precision, double precision, text) TO authenticated;

-- ── Alert handling ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_set_alert_status(
  _alert_id uuid,
  _status public.fleet_alert_status,
  _notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.can_manage_fleet(me) THEN
    RAISE EXCEPTION 'You are not authorised to action fleet alerts';
  END IF;

  UPDATE public.fleet_alerts SET
    status = _status,
    acknowledged_by = CASE WHEN _status = 'acknowledged' THEN me ELSE acknowledged_by END,
    acknowledged_at = CASE WHEN _status = 'acknowledged' THEN now() ELSE acknowledged_at END,
    resolved_by = CASE WHEN _status IN ('resolved', 'dismissed') THEN me ELSE resolved_by END,
    resolved_at = CASE WHEN _status IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
    resolution_notes = COALESCE(_notes, resolution_notes)
  WHERE id = _alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_set_alert_status(uuid, public.fleet_alert_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_set_alert_status(uuid, public.fleet_alert_status, text) TO authenticated;

-- ── Offline tracker sweep (called by the scheduled job) ────────────────────
CREATE OR REPLACE FUNCTION public.fleet_flag_offline_devices(_minutes int DEFAULT 30)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted int := 0;
BEGIN
  WITH stale AS (
    SELECT v.* FROM public.fleet_vehicles v
    WHERE v.status = 'active'
      AND v.device_id IS NOT NULL
      AND (v.last_seen_at IS NULL OR v.last_seen_at < now() - make_interval(mins => _minutes))
      AND NOT EXISTS (
        SELECT 1 FROM public.fleet_alerts a
        WHERE a.vehicle_id = v.id AND a.alert_type = 'device_offline'
          AND a.status IN ('new', 'acknowledged')
      )
  ), ins AS (
    INSERT INTO public.fleet_alerts (vehicle_id, alert_type, severity, message, lat, lng)
    SELECT s.id, 'device_offline', 'warning',
      s.registration_number || ' tracker has not reported for over ' || _minutes || ' minutes',
      s.last_lat, s.last_lng
    FROM stale s
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_flag_offline_devices(int) FROM PUBLIC, anon, authenticated;

-- ── Fleet summary for dashboards ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorised to view fleet analytics';
  END IF;

  SELECT jsonb_build_object(
    'vehicles_total', (SELECT count(*) FROM public.fleet_vehicles),
    'vehicles_active', (SELECT count(*) FROM public.fleet_vehicles WHERE status = 'active'),
    'vehicles_maintenance', (SELECT count(*) FROM public.fleet_vehicles WHERE status = 'maintenance'),
    'reporting_now', (SELECT count(*) FROM public.fleet_vehicles WHERE last_seen_at > now() - interval '15 minutes'),
    'moving_now', (SELECT count(*) FROM public.fleet_vehicles WHERE last_seen_at > now() - interval '15 minutes' AND COALESCE(last_speed_kph, 0) > 5),
    'open_alerts', (SELECT count(*) FROM public.fleet_alerts WHERE status = 'new'),
    'open_panic', (SELECT count(*) FROM public.fleet_alerts WHERE status = 'new' AND alert_type = 'panic'),
    'alerts_24h', (SELECT count(*) FROM public.fleet_alerts WHERE occurred_at > now() - interval '24 hours'),
    'avg_fuel_pct', (SELECT round(avg(last_fuel_level_pct), 1) FROM public.fleet_vehicles WHERE last_fuel_level_pct IS NOT NULL),
    'low_fuel', (SELECT count(*) FROM public.fleet_vehicles WHERE last_fuel_level_pct IS NOT NULL AND last_fuel_level_pct <= low_fuel_threshold_pct),
    'geofences_active', (SELECT count(*) FROM public.fleet_geofences WHERE active),
    'distance_24h_km', (
      SELECT COALESCE(round(sum(GREATEST(d, 0))::numeric, 1), 0) FROM (
        SELECT max(odometer_km) - min(odometer_km) AS d
        FROM public.fleet_positions
        WHERE recorded_at > now() - interval '24 hours' AND odometer_km IS NOT NULL
        GROUP BY vehicle_id
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_summary() TO authenticated;

-- ── Realtime for the live map ─────────────────────────────────────────────
ALTER TABLE public.fleet_vehicles REPLICA IDENTITY FULL;
ALTER TABLE public.fleet_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_alerts;