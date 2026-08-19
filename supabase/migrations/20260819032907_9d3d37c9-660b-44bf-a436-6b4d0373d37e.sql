CREATE OR REPLACE FUNCTION public.fleet_dashboard(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  win_days integer := GREATEST(1, LEAST(COALESCE(_days, 7), 90));
  since timestamptz;
  expected_hours numeric;
BEGIN
  IF NOT public.can_manage_fleet(auth.uid()) THEN
    RAISE EXCEPTION 'You are not authorised to view fleet analytics';
  END IF;

  since := now() - make_interval(days => win_days);
  expected_hours := win_days * 24;

  WITH veh AS (
    SELECT * FROM public.fleet_vehicles WHERE status <> 'decommissioned'
  ),
  pos AS (
    SELECT p.vehicle_id,
           date_trunc('hour', p.recorded_at) AS hour_bucket,
           date_trunc('day', p.recorded_at) AS day_bucket,
           p.odometer_km
    FROM public.fleet_positions p
    WHERE p.recorded_at >= since
  ),
  uptime AS (
    SELECT v.id AS vehicle_id,
           COUNT(DISTINCT p.hour_bucket) AS hours_online,
           COUNT(DISTINCT p.day_bucket) AS days_reporting,
           COALESCE(GREATEST(MAX(p.odometer_km) - MIN(p.odometer_km), 0), 0) AS distance_km
    FROM veh v
    LEFT JOIN pos p ON p.vehicle_id = v.id
    GROUP BY v.id
  ),
  fuel AS (
    SELECT f.vehicle_id,
           COALESCE(SUM(CASE WHEN f.event_type = 'reading' AND f.delta_litres < 0 THEN -f.delta_litres END), 0) AS litres_used,
           COALESCE(SUM(CASE WHEN f.event_type = 'refuel' THEN GREATEST(f.delta_litres, 0) END), 0) AS litres_refuelled,
           COUNT(*) FILTER (WHERE f.event_type = 'refuel') AS refuels,
           COUNT(*) FILTER (WHERE f.event_type = 'drain') AS suspected_drains
    FROM public.fleet_fuel_readings f
    WHERE f.recorded_at >= since
    GROUP BY f.vehicle_id
  ),
  alerts AS (
    SELECT a.vehicle_id, a.alert_type, a.status, a.occurred_at, a.resolved_at
    FROM public.fleet_alerts a
    WHERE a.occurred_at >= since
  ),
  gf AS (
    SELECT e.vehicle_id, e.event_type, (g.severity = 'critical') AS restricted
    FROM public.fleet_geofence_events e
    JOIN public.fleet_geofences g ON g.id = e.geofence_id
    WHERE e.occurred_at >= since
  )
  SELECT jsonb_build_object(
    'window_days', win_days,
    'since', since,
    'vehicles_total', (SELECT count(*) FROM veh),
    'uptime', jsonb_build_object(
      'avg_uptime_pct', COALESCE((
        SELECT round(avg(LEAST(u.hours_online / NULLIF(expected_hours, 0) * 100, 100))::numeric, 1)
        FROM uptime u
      ), 0),
      'total_hours_online', COALESCE((SELECT sum(u.hours_online) FROM uptime u), 0),
      'vehicles_reporting', (SELECT count(*) FROM uptime u WHERE u.hours_online > 0),
      'vehicles_silent', (SELECT count(*) FROM uptime u WHERE u.hours_online = 0),
      'distance_km', COALESCE((SELECT round(sum(u.distance_km)::numeric, 1) FROM uptime u), 0)
    ),
    'geofence', jsonb_build_object(
      'events_total', (SELECT count(*) FROM gf),
      'restricted_breaches', (SELECT count(*) FROM gf WHERE restricted AND event_type = 'enter'),
      'authorised_events', (SELECT count(*) FROM gf WHERE NOT restricted),
      'compliance_pct', CASE
        WHEN (SELECT count(*) FROM gf) = 0 THEN 100
        ELSE round((1 - (SELECT count(*) FROM gf WHERE restricted AND event_type = 'enter')::numeric
                        / (SELECT count(*) FROM gf)) * 100, 1)
      END,
      'zones_active', (SELECT count(*) FROM public.fleet_geofences WHERE active)
    ),
    'fuel', jsonb_build_object(
      'litres_used', COALESCE((SELECT round(sum(litres_used)::numeric, 1) FROM fuel), 0),
      'litres_refuelled', COALESCE((SELECT round(sum(litres_refuelled)::numeric, 1) FROM fuel), 0),
      'refuels', COALESCE((SELECT sum(refuels) FROM fuel), 0),
      'suspected_drains', COALESCE((SELECT sum(suspected_drains) FROM fuel), 0),
      'litres_per_100km', CASE
        WHEN COALESCE((SELECT sum(u.distance_km) FROM uptime u), 0) > 0
        THEN round((COALESCE((SELECT sum(litres_used) FROM fuel), 0)
                     / (SELECT sum(u.distance_km) FROM uptime u) * 100)::numeric, 1)
        ELSE NULL END,
      'avg_fuel_pct', (SELECT round(avg(last_fuel_level_pct), 1) FROM veh WHERE last_fuel_level_pct IS NOT NULL),
      'low_fuel_vehicles', (SELECT count(*) FROM veh
        WHERE last_fuel_level_pct IS NOT NULL AND last_fuel_level_pct <= low_fuel_threshold_pct)
    ),
    'alerts', jsonb_build_object(
      'total', (SELECT count(*) FROM alerts),
      'resolved', (SELECT count(*) FROM alerts WHERE status IN ('resolved', 'dismissed')),
      'open', (SELECT count(*) FROM alerts WHERE status = 'new'),
      'acknowledged', (SELECT count(*) FROM alerts WHERE status = 'acknowledged'),
      'resolution_pct', CASE
        WHEN (SELECT count(*) FROM alerts) = 0 THEN 100
        ELSE round((SELECT count(*) FROM alerts WHERE status IN ('resolved', 'dismissed'))::numeric
                    / (SELECT count(*) FROM alerts) * 100, 1)
      END,
      'avg_resolution_minutes', (
        SELECT round(avg(EXTRACT(epoch FROM (resolved_at - occurred_at)) / 60)::numeric, 1)
        FROM alerts WHERE resolved_at IS NOT NULL
      ),
      'by_type', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'alert_type', t.alert_type,
                 'total', t.total,
                 'resolved', t.resolved,
                 'open', t.open_count
               ) ORDER BY t.total DESC)
        FROM (
          SELECT alert_type,
                 count(*) AS total,
                 count(*) FILTER (WHERE status IN ('resolved', 'dismissed')) AS resolved,
                 count(*) FILTER (WHERE status = 'new') AS open_count
          FROM alerts GROUP BY alert_type
        ) t
      ), '[]'::jsonb)
    ),
    'vehicles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'vehicle_id', v.id,
               'registration_number', v.registration_number,
               'call_sign', v.call_sign,
               'status', v.status,
               'last_seen_at', v.last_seen_at,
               'uptime_pct', round(LEAST(u.hours_online / NULLIF(expected_hours, 0) * 100, 100)::numeric, 1),
               'hours_online', u.hours_online,
               'days_reporting', u.days_reporting,
               'distance_km', round(u.distance_km::numeric, 1),
               'litres_used', round(COALESCE(f.litres_used, 0)::numeric, 1),
               'fuel_level_pct', v.last_fuel_level_pct,
               'open_alerts', (SELECT count(*) FROM alerts a WHERE a.vehicle_id = v.id AND a.status = 'new'),
               'restricted_breaches', (SELECT count(*) FROM gf x WHERE x.vehicle_id = v.id AND x.restricted AND x.event_type = 'enter')
             ) ORDER BY v.registration_number)
      FROM veh v
      JOIN uptime u ON u.vehicle_id = v.id
      LEFT JOIN fuel f ON f.vehicle_id = v.id
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'day', d.day,
               'reporting_vehicles', d.reporting_vehicles,
               'alerts', d.alerts,
               'resolved', d.resolved
             ) ORDER BY d.day)
      FROM (
        SELECT gs::date AS day,
               (SELECT count(DISTINCT vehicle_id) FROM pos p WHERE p.day_bucket = gs) AS reporting_vehicles,
               (SELECT count(*) FROM alerts a WHERE date_trunc('day', a.occurred_at) = gs) AS alerts,
               (SELECT count(*) FROM alerts a WHERE date_trunc('day', a.occurred_at) = gs
                  AND a.status IN ('resolved', 'dismissed')) AS resolved
        FROM generate_series(date_trunc('day', since), date_trunc('day', now()), interval '1 day') gs
      ) d
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;