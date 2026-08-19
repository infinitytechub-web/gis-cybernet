CREATE OR REPLACE FUNCTION public.command_dashboard(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date;
  since timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_command_tier(actor) THEN
    RAISE EXCEPTION 'Command authority required';
  END IF;

  WITH reach AS (
    SELECT u.id FROM public.org_units u
    WHERE u.id IN (SELECT public.command_reach_units(actor))
  ),
  branches AS (
    SELECT u.id, u.name, u.type::text AS unit_type, u.parent_id
    FROM public.org_units u
    JOIN reach r ON r.id = u.id
  ),
  branch_units AS (
    SELECT b.id AS branch_id, d AS unit_id
    FROM branches b
    CROSS JOIN public.org_unit_descendants(b.id) d
    WHERE d IN (SELECT id FROM reach)
  ),
  staff AS (
    SELECT bu.branch_id, p.id AS profile_id
    FROM branch_units bu
    JOIN public.profiles p ON p.org_unit_id = bu.unit_id
    WHERE COALESCE(p.status::text, 'active') = 'active'
  ),
  attendance AS (
    SELECT s.branch_id,
           count(*) FILTER (WHERE a.status::text = 'present') AS present,
           count(*) FILTER (WHERE a.status::text = 'late') AS late,
           count(*) FILTER (WHERE a.status::text = 'excused') AS excused,
           count(*) FILTER (WHERE a.status::text = 'absent') AS absent
    FROM staff s
    LEFT JOIN public.attendances a
      ON a.profile_id = s.profile_id AND a.date = today
    GROUP BY s.branch_id
  ),
  head AS (
    SELECT branch_id, count(*) AS staff_total FROM staff GROUP BY branch_id
  ),
  vehicles AS (
    SELECT bu.branch_id,
           count(*) AS total,
           count(*) FILTER (WHERE v.status::text = 'active') AS active,
           count(*) FILTER (WHERE v.status::text = 'maintenance') AS maintenance,
           count(*) FILTER (WHERE v.status::text = 'grounded') AS grounded,
           count(*) FILTER (WHERE v.immobilized) AS immobilized,
           count(*) FILTER (WHERE v.last_seen_at IS NULL OR v.last_seen_at < now() - interval '30 minutes') AS offline,
           round(avg(v.last_fuel_level_pct)::numeric, 1) AS avg_fuel,
           count(*) FILTER (
             WHERE v.last_fuel_level_pct IS NOT NULL
               AND v.last_fuel_level_pct <= COALESCE(v.low_fuel_threshold_pct, 20)
           ) AS low_fuel
    FROM branch_units bu
    JOIN public.fleet_vehicles v ON v.org_unit_id = bu.unit_id
    GROUP BY bu.branch_id
  ),
  cmd_alerts AS (
    SELECT bu.branch_id,
           count(*) FILTER (WHERE a.status::text <> 'closed') AS open_alerts,
           count(*) FILTER (WHERE a.status::text <> 'closed' AND a.severity::text = 'critical') AS critical_alerts
    FROM branch_units bu
    JOIN public.command_alerts a ON a.org_unit_id = bu.unit_id
    WHERE a.created_at >= since
    GROUP BY bu.branch_id
  ),
  fleet_al AS (
    SELECT bu.branch_id, count(*) AS open_fleet_alerts
    FROM branch_units bu
    JOIN public.fleet_vehicles v ON v.org_unit_id = bu.unit_id
    JOIN public.fleet_alerts fa ON fa.vehicle_id = v.id
    WHERE fa.status::text IN ('new', 'acknowledged') AND fa.occurred_at >= since
    GROUP BY bu.branch_id
  ),
  cyber AS (
    SELECT bu.branch_id,
           count(*) FILTER (WHERE lower(c.status) NOT IN ('resolved', 'closed')) AS open_cyber,
           count(*) AS cyber_total
    FROM branch_units bu
    JOIN public.cyber_incidents c ON c.org_unit_id = bu.unit_id
    WHERE c.reported_at >= since
    GROUP BY bu.branch_id
  )
  SELECT jsonb_build_object(
    'as_of', now(),
    'day', today,
    'days', GREATEST(COALESCE(_days, 30), 1),
    'branches', COALESCE(jsonb_agg(r.row ORDER BY r.row->>'name'), '[]'::jsonb)
  )
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'org_unit_id', b.id,
      'name', b.name,
      'unit_type', b.unit_type,
      'staff_total', COALESCE(h.staff_total, 0),
      'present', COALESCE(at.present, 0),
      'late', COALESCE(at.late, 0),
      'excused', COALESCE(at.excused, 0),
      'absent', COALESCE(at.absent, 0),
      'vehicles_total', COALESCE(v.total, 0),
      'vehicles_active', COALESCE(v.active, 0),
      'vehicles_maintenance', COALESCE(v.maintenance, 0),
      'vehicles_grounded', COALESCE(v.grounded, 0),
      'vehicles_immobilized', COALESCE(v.immobilized, 0),
      'vehicles_offline', COALESCE(v.offline, 0),
      'avg_fuel_pct', v.avg_fuel,
      'low_fuel', COALESCE(v.low_fuel, 0),
      'open_alerts', COALESCE(ca.open_alerts, 0),
      'critical_alerts', COALESCE(ca.critical_alerts, 0),
      'open_fleet_alerts', COALESCE(fl.open_fleet_alerts, 0),
      'open_cyber', COALESCE(cy.open_cyber, 0),
      'cyber_total', COALESCE(cy.cyber_total, 0)
    ) AS row
    FROM branches b
    LEFT JOIN head h ON h.branch_id = b.id
    LEFT JOIN attendance at ON at.branch_id = b.id
    LEFT JOIN vehicles v ON v.branch_id = b.id
    LEFT JOIN cmd_alerts ca ON ca.branch_id = b.id
    LEFT JOIN fleet_al fl ON fl.branch_id = b.id
    LEFT JOIN cyber cy ON cy.branch_id = b.id
  ) r;

  RETURN COALESCE(result, jsonb_build_object('as_of', now(), 'day', today, 'days', 30, 'branches', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.command_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_dashboard(integer) TO authenticated;