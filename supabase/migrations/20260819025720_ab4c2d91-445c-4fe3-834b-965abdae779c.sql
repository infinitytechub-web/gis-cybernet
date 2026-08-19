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