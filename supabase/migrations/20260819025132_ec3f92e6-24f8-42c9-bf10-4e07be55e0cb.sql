ALTER TABLE public.fleet_positions
  ADD COLUMN IF NOT EXISTS door_open boolean,
  ADD COLUMN IF NOT EXISTS boot_open boolean;

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS last_door_open boolean,
  ADD COLUMN IF NOT EXISTS last_boot_open boolean;

ALTER TYPE public.fleet_alert_type ADD VALUE IF NOT EXISTS 'door_open';
ALTER TYPE public.fleet_alert_type ADD VALUE IF NOT EXISTS 'boot_open';

CREATE OR REPLACE FUNCTION public.can_view_org_unit(_user_id uuid, _org_unit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  home uuid;
BEGIN
  IF _user_id IS NULL OR _org_unit_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_command_tier(_user_id) THEN
    RETURN true;
  END IF;

  SELECT org_unit_id INTO home FROM public.profiles WHERE id = _user_id;

  IF home IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_unit_descendants(home) d WHERE d = _org_unit_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.org_unit_assignments a
    WHERE a.user_id = _user_id
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND EXISTS (
        SELECT 1 FROM public.org_unit_descendants(a.org_unit_id) d WHERE d = _org_unit_id
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_org_unit(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unit_dashboard(_org_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit public.org_units;
  units uuid[];
  staff_ids uuid[];
  result jsonb;
BEGIN
  IF NOT public.can_view_org_unit(auth.uid(), _org_unit_id) THEN
    RAISE EXCEPTION 'Not authorised to view this unit';
  END IF;

  SELECT * INTO unit FROM public.org_units WHERE id = _org_unit_id;
  IF unit.id IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  SELECT array_agg(d) INTO units FROM public.org_unit_descendants(_org_unit_id) d;
  SELECT array_agg(p.id) INTO staff_ids FROM public.profiles p WHERE p.org_unit_id = ANY(units);
  staff_ids := COALESCE(staff_ids, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'unit', jsonb_build_object('id', unit.id, 'name', unit.name, 'code', unit.code, 'type', unit.type),
    'unit_ids', to_jsonb(units),
    'staff', COALESCE((
      SELECT jsonb_agg(s ORDER BY s->>'full_name')
      FROM (
        SELECT jsonb_build_object(
          'id', p.id, 'full_name', p.full_name, 'staff_id', p.staff_id,
          'status', p.status, 'rank', r.name, 'department', dp.name,
          'unit_name', ou.name
        ) AS s
        FROM public.profiles p
        LEFT JOIN public.ranks r ON r.id = p.rank_id
        LEFT JOIN public.departments dp ON dp.id = p.department_id
        LEFT JOIN public.org_units ou ON ou.id = p.org_unit_id
        WHERE p.org_unit_id = ANY(units)
        LIMIT 500
      ) q
    ), '[]'::jsonb),
    'staff_total', (SELECT count(*) FROM public.profiles p WHERE p.org_unit_id = ANY(units)),
    'staff_active', (SELECT count(*) FROM public.profiles p WHERE p.org_unit_id = ANY(units) AND p.status = 'active'),
    'detainees', COALESCE((
      SELECT jsonb_agg(d ORDER BY d->>'intake_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', dr.id,
          'name', dr.first_name || ' ' || dr.last_name,
          'nationality', dr.nationality,
          'crime_type', dr.crime_type,
          'status', dr.status,
          'intake_at', dr.intake_at,
          'cell_number', dr.cell_number,
          'risk_level', dr.risk_level
        ) AS d
        FROM public.detention_records dr
        WHERE dr.created_by = ANY(staff_ids)
           OR dr.arresting_officer_id = ANY(staff_ids)
           OR dr.officer_in_charge_id = ANY(staff_ids)
        ORDER BY dr.intake_at DESC
        LIMIT 200
      ) q
    ), '[]'::jsonb),
    'detainees_in_custody', (
      SELECT count(*) FROM public.detention_records dr
      WHERE dr.status = 'in_custody'
        AND (dr.created_by = ANY(staff_ids) OR dr.arresting_officer_id = ANY(staff_ids) OR dr.officer_in_charge_id = ANY(staff_ids))
    ),
    'cases', COALESCE((
      SELECT jsonb_agg(c ORDER BY c->>'operation_date' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', o.id,
          'log_reference', o.log_reference,
          'operation_type', o.operation_type,
          'location', o.location,
          'status', o.status,
          'severity', o.severity,
          'operation_date', o.operation_date,
          'arrests_count', o.arrests_count
        ) AS c
        FROM public.operations o
        WHERE o.reported_by = ANY(staff_ids) OR o.officer_in_charge = ANY(staff_ids)
        ORDER BY o.operation_date DESC
        LIMIT 200
      ) q
    ), '[]'::jsonb),
    'cases_open', (
      SELECT count(*) FROM public.operations o
      WHERE o.status IN ('open', 'in_progress')
        AND (o.reported_by = ANY(staff_ids) OR o.officer_in_charge = ANY(staff_ids))
    ),
    'vehicles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'registration_number', v.registration_number, 'call_sign', v.call_sign,
        'status', v.status, 'last_seen_at', v.last_seen_at
      ))
      FROM public.fleet_vehicles v
      WHERE v.org_unit_id = ANY(units)
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unit_dashboard(uuid) TO authenticated;

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

  -- keep last-known state current for the live map
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
        CASE WHEN COALESCE(NEW.speed_kph, 0) > 5 THEN 'critical' ELSE 'warning' END,
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
      CASE WHEN COALESCE(NEW.speed_kph, 0) > 5 THEN 'critical' ELSE 'warning' END,
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
$function$;