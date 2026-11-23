CREATE OR REPLACE FUNCTION public.fleet_maintenance_status()
 RETURNS TABLE(vehicle_id uuid, registration_number text, call_sign text, org_unit_name text, odometer_km numeric, service_type text, interval_km numeric, interval_days integer, last_service_date date, last_service_odometer_km numeric, next_due_km numeric, next_due_date date, km_remaining numeric, days_remaining integer, due_state text, services_12m bigint, cost_12m numeric, downtime_12m numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT v.id AS vehicle_id, v.registration_number, v.call_sign, u.name AS org_unit_name, v.odometer_km,
           s.service_type, s.interval_km, s.interval_days, s.last_service_date, s.last_service_odometer_km,
           CASE WHEN s.interval_km IS NOT NULL THEN COALESCE(s.last_service_odometer_km, 0) + s.interval_km END AS next_due_km,
           CASE WHEN s.interval_days IS NOT NULL AND s.last_service_date IS NOT NULL THEN s.last_service_date + s.interval_days END AS next_due_date
    FROM public.fleet_vehicles v
    LEFT JOIN public.org_units u ON u.id = v.org_unit_id
    LEFT JOIN public.fleet_maintenance_schedules s ON s.vehicle_id = v.id AND s.is_active
    WHERE v.status <> 'decommissioned'
      AND (public.has_role(auth.uid(),'admin') OR (v.org_unit_id IS NOT NULL AND public.can_view_org_unit(auth.uid(), v.org_unit_id)))
  ), agg AS (
    SELECT r.vehicle_id, count(*) AS services_12m, COALESCE(sum(r.cost), 0) AS cost_12m, COALESCE(sum(r.downtime_days), 0) AS downtime_12m
    FROM public.fleet_maintenance_records r
    WHERE r.service_date >= (now())::date - 365
    GROUP BY r.vehicle_id
  )
  SELECT b.vehicle_id, b.registration_number, b.call_sign, b.org_unit_name, b.odometer_km,
         b.service_type, b.interval_km, b.interval_days, b.last_service_date,
         b.last_service_odometer_km, b.next_due_km, b.next_due_date,
         CASE WHEN b.next_due_km IS NULL THEN NULL ELSE b.next_due_km - COALESCE(b.odometer_km, 0) END AS km_remaining,
         CASE WHEN b.next_due_date IS NULL THEN NULL ELSE (b.next_due_date - (now())::date) END AS days_remaining,
         CASE
           WHEN b.service_type IS NULL THEN 'unscheduled'
           WHEN (b.next_due_km IS NOT NULL AND COALESCE(b.odometer_km, 0) >= b.next_due_km)
             OR (b.next_due_date IS NOT NULL AND b.next_due_date < (now())::date) THEN 'overdue'
           WHEN (b.next_due_km IS NOT NULL AND b.next_due_km - COALESCE(b.odometer_km, 0) <= GREATEST(b.interval_km * 0.1, 500))
             OR (b.next_due_date IS NOT NULL AND b.next_due_date - (now())::date <= 14) THEN 'due_soon'
           ELSE 'ok'
         END AS due_state,
         COALESCE(a.services_12m, 0) AS services_12m, COALESCE(a.cost_12m, 0) AS cost_12m, COALESCE(a.downtime_12m, 0) AS downtime_12m
  FROM base b
  LEFT JOIN agg a ON a.vehicle_id = b.vehicle_id
  ORDER BY b.registration_number, b.service_type;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_vehicle_usage(_days integer DEFAULT 30)
 RETURNS TABLE(vehicle_id uuid, registration_number text, call_sign text, odometer_km integer, patrol_count bigint, patrol_distance_km numeric, patrol_fuel_litres numeric, patrol_hours numeric, avg_hours_per_patrol numeric, km_per_hour numeric, litres_per_hour numeric, refuel_litres numeric, refuel_cost_ghs numeric, last_odometer_reading numeric, last_reading_at timestamp with time zone, km_per_litre numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH since AS (
    SELECT (now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1)))::date AS d
  ),
  v AS (
    SELECT fv.id, fv.registration_number, fv.call_sign, fv.odometer_km, fv.org_unit_id
      FROM public.fleet_vehicles fv
     WHERE public.has_role(auth.uid(),'admin') OR (fv.org_unit_id IS NOT NULL AND public.can_view_org_unit(auth.uid(), fv.org_unit_id))
  ),
  p AS (
    SELECT pl.vehicle_id,
           count(*) AS patrol_count,
           COALESCE(SUM(GREATEST(pl.odometer_end_km - pl.odometer_start_km, 0)), 0) AS distance_km,
           COALESCE(SUM(pl.fuel_used_litres), 0) AS fuel_litres,
           COALESCE(SUM(
             CASE WHEN pl.end_time IS NULL THEN NULL
               ELSE EXTRACT(epoch FROM (
                      CASE WHEN pl.end_time < pl.start_time THEN pl.end_time + interval '24 hours' ELSE pl.end_time END - pl.start_time)) / 3600.0
             END), 0) AS hours,
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
  SELECT v.id, v.registration_number, v.call_sign, v.odometer_km,
         COALESCE(p.patrol_count, 0),
         ROUND(COALESCE(p.distance_km, 0)::numeric, 1),
         ROUND(COALESCE(p.fuel_litres, 0)::numeric, 1),
         ROUND(COALESCE(p.hours, 0)::numeric, 2),
         CASE WHEN COALESCE(p.timed_patrols, 0) > 0 THEN ROUND((p.hours / p.timed_patrols)::numeric, 2) END,
         CASE WHEN COALESCE(p.hours, 0) > 0 THEN ROUND((COALESCE(p.distance_km, 0) / p.hours)::numeric, 1) END,
         CASE WHEN COALESCE(p.hours, 0) > 0 AND COALESCE(p.fuel_litres, 0) > 0 THEN ROUND((p.fuel_litres / p.hours)::numeric, 2) END,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_protected_fields(_user_id uuid)
 RETURNS TABLE(department_id uuid, rank_id uuid, status text, account_locked boolean, login_enabled boolean, staff_id text, shift_group text, unit text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.department_id, p.rank_id, p.status::text, p.account_locked, p.login_enabled, p.staff_id, p.shift_group::text, p.unit
  FROM public.profiles p
  WHERE p.user_id = _user_id AND _user_id = auth.uid()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.leave_usage_by_location(_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS TABLE(region_name text, station_name text, leave_type text, approved_days numeric, pending_days numeric, staff_count integer, request_count integer, latitude numeric, longitude numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH RECURSIVE scope AS (
    SELECT auth.uid() AS uid, public.has_role(auth.uid(), 'admin') AS see_all
  ),
  chain AS (
    SELECT u.id AS root_id, u.id AS node_id, u.name AS node_name, u.type AS node_type,
           u.parent_id AS node_parent, u.latitude AS node_lat, u.longitude AS node_lng, 0 AS depth
    FROM public.org_units u
    UNION ALL
    SELECT c.root_id, pu.id, pu.name, pu.type, pu.parent_id, pu.latitude, pu.longitude, c.depth + 1
    FROM chain c
    JOIN public.org_units pu ON pu.id = c.node_parent
  ),
  resolved AS (
    SELECT root_id,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type IN ('station','unit')))[1] AS r_station,
      (ARRAY_AGG(node_name ORDER BY depth) FILTER (WHERE node_type = 'regional'))[1] AS r_region,
      (ARRAY_AGG(node_lat ORDER BY depth) FILTER (WHERE node_lat IS NOT NULL))[1] AS r_lat,
      (ARRAY_AGG(node_lng ORDER BY depth) FILTER (WHERE node_lng IS NOT NULL))[1] AS r_lng
    FROM chain
    GROUP BY root_id
  ),
  visible AS (
    SELECT pr.id AS profile_id,
      COALESCE(res.r_region, 'Unassigned')::text AS region_name,
      COALESCE(res.r_station, ou.name, 'Unassigned')::text AS station_name,
      res.r_lat AS latitude,
      res.r_lng AS longitude
    FROM scope s
    CROSS JOIN public.profiles pr
    LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
    LEFT JOIN resolved res ON res.root_id = pr.org_unit_id
    WHERE s.uid IS NOT NULL AND pr.deleted_at IS NULL
      AND (s.see_all OR pr.user_id = s.uid OR public.can_see_org_unit(s.uid, pr.org_unit_id))
  ),
  spans AS (
    SELECT lr.profile_id, lr.type::text AS leave_type, lr.status::text AS status,
      GREATEST((LEAST(lr.end_date, make_date(_year, 12, 31)) - GREATEST(lr.start_date, make_date(_year, 1, 1)) + 1), 0)::numeric AS days
    FROM public.leave_requests lr
    WHERE lr.start_date <= make_date(_year, 12, 31)
      AND lr.end_date >= make_date(_year, 1, 1)
  )
  SELECT v.region_name, v.station_name, sp.leave_type,
    COALESCE(SUM(sp.days) FILTER (WHERE sp.status = 'approved'), 0)::numeric,
    COALESCE(SUM(sp.days) FILTER (WHERE sp.status = 'pending'), 0)::numeric,
    COUNT(DISTINCT sp.profile_id)::int,
    COUNT(*)::int,
    MAX(v.latitude)::numeric,
    MAX(v.longitude)::numeric
  FROM visible v
  JOIN spans sp ON sp.profile_id = v.profile_id
  GROUP BY v.region_name, v.station_name, sp.leave_type;
$function$;

CREATE OR REPLACE FUNCTION public.procurement_budget_status(_fiscal_year integer DEFAULT NULL::integer)
 RETURNS TABLE(org_unit_id uuid, org_unit_name text, org_unit_code text, fiscal_year integer, budget_amount numeric, currency text, committed numeric, pending numeric, remaining numeric, utilisation_pct numeric, request_count bigint, over_budget boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH yr AS (SELECT COALESCE(_fiscal_year, EXTRACT(YEAR FROM now())::int) AS y),
  spend AS (
    SELECT r.org_unit_id,
           COALESCE(SUM(CASE WHEN r.status IN ('approved', 'partial', 'received') THEN COALESCE(r.estimated_cost, 0) ELSE 0 END), 0) AS committed,
           COALESCE(SUM(CASE WHEN r.status = 'submitted' THEN COALESCE(r.estimated_cost, 0) ELSE 0 END), 0) AS pending,
           COUNT(*) FILTER (WHERE r.status <> 'draft') AS request_count
    FROM public.purchase_requisitions r, yr
    WHERE r.org_unit_id IS NOT NULL
      AND EXTRACT(YEAR FROM r.created_at)::int = yr.y
    GROUP BY r.org_unit_id
  )
  SELECT u.id, u.name, u.code, (SELECT y FROM yr),
         COALESCE(b.budget_amount, 0),
         COALESCE(b.currency, 'GHS'),
         COALESCE(s.committed, 0),
         COALESCE(s.pending, 0),
         COALESCE(b.budget_amount, 0) - COALESCE(s.committed, 0) - COALESCE(s.pending, 0) AS remaining,
         CASE WHEN COALESCE(b.budget_amount, 0) > 0
              THEN ROUND(((COALESCE(s.committed, 0) + COALESCE(s.pending, 0)) / b.budget_amount) * 100, 1)
              ELSE NULL END AS utilisation_pct,
         COALESCE(s.request_count, 0),
         (COALESCE(b.budget_amount, 0) > 0 AND COALESCE(s.committed, 0) + COALESCE(s.pending, 0) > b.budget_amount) AS over_budget
  FROM public.org_units u
  LEFT JOIN public.procurement_budgets b ON b.org_unit_id = u.id AND b.fiscal_year = (SELECT y FROM yr)
  LEFT JOIN spend s ON s.org_unit_id = u.id
  WHERE u.is_active
    AND (public.has_role(auth.uid(),'admin') OR public.can_view_org_unit(auth.uid(), u.id))
    AND (b.id IS NOT NULL OR s.org_unit_id IS NOT NULL)
  ORDER BY u.name;
$function$;

CREATE OR REPLACE FUNCTION public.search_authorising_officers(_search text DEFAULT NULL::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, first_name text, last_name text, rank_abbrev text, department_name text, role text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  is_command BOOLEAN;
  effective_limit INT := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  search_term TEXT := NULLIF(TRIM(COALESCE(_search, '')), '');
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  is_command := public.has_role(uid, 'admin') OR public.has_role(uid, 'oic') OR public.has_role(uid, '2ic') OR public.has_role(uid, 'staff_officer');

  RETURN QUERY
  WITH viewer_depts AS (
    SELECT DISTINCT ud.department_id FROM public.user_department_ids(uid) ud
  ),
  ranked AS (
    SELECT p.id AS profile_id, p.first_name AS p_first_name, p.last_name AS p_last_name,
      r.abbreviation AS p_rank_abbrev, d.name AS p_department_name, ur.role::TEXT AS p_role,
      ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY CASE ur.role::TEXT WHEN 'oic' THEN 0 WHEN '2ic' THEN 1 ELSE 2 END) AS rn
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    LEFT JOIN public.ranks r       ON r.id = p.rank_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE ur.role::TEXT IN ('oic', '2ic') AND p.deleted_at IS NULL
      AND (
        is_command
        OR (ur.role::TEXT = 'oic' AND public.can_see_org_unit(uid, p.org_unit_id))
        OR EXISTS (SELECT 1 FROM public.profile_departments pd JOIN viewer_depts vd ON vd.department_id = pd.department_id WHERE pd.profile_id = p.id)
        OR EXISTS (SELECT 1 FROM viewer_depts vd WHERE vd.department_id = p.department_id)
      )
      AND (search_term IS NULL OR p.first_name ILIKE '%' || search_term || '%' OR p.last_name ILIKE '%' || search_term || '%')
  )
  SELECT ranked.profile_id, ranked.p_first_name, ranked.p_last_name, ranked.p_rank_abbrev, ranked.p_department_name, ranked.p_role
  FROM ranked
  WHERE ranked.rn = 1
  ORDER BY CASE ranked.p_role WHEN 'oic' THEN 0 WHEN '2ic' THEN 1 ELSE 2 END, ranked.p_last_name, ranked.p_first_name
  LIMIT effective_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.command_approval_queue()
 RETURNS TABLE(kind text, id uuid, profile_id uuid, staff_name text, status text, stage text, from_unit text, to_unit text, detail text, created_at timestamp with time zone, can_act boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() uid, public.has_role(auth.uid(),'admin') adm)
  SELECT 'transfer', t.id, t.profile_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), t.status,
    CASE t.status WHEN 'pending' THEN 'Releasing command OIC/2IC' ELSE 'Receiving command OIC/2IC' END,
    fu.name, tu.name, t.reason, t.created_at,
    (p.user_id IS DISTINCT FROM me.uid) AND CASE t.status
      WHEN 'pending' THEN me.adm OR public.is_command_head_for(me.uid, coalesce(t.from_org_unit_id,p.org_unit_id))
      ELSE (me.adm OR public.is_command_head_for(me.uid, t.to_org_unit_id)) AND (me.adm OR t.recommended_by IS DISTINCT FROM me.uid) END
  FROM public.staff_transfer_requests t CROSS JOIN me
  JOIN public.profiles p ON p.id=t.profile_id
  LEFT JOIN public.org_units fu ON fu.id=coalesce(t.from_org_unit_id,p.org_unit_id)
  LEFT JOIN public.org_units tu ON tu.id=t.to_org_unit_id
  WHERE t.status IN ('pending','recommended') AND me.uid IS NOT NULL AND p.deleted_at IS NULL
    AND (me.adm OR public.is_command_head_for(me.uid, coalesce(t.from_org_unit_id,p.org_unit_id)) OR public.is_command_head_for(me.uid, t.to_org_unit_id))
  UNION ALL
  SELECT 'promotion', s.id, s.profile_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), s.status,
    'Command OIC/2IC', u.name, NULL, coalesce(rk.name,'New rank'), s.created_at,
    (p.user_id IS DISTINCT FROM me.uid) AND (me.adm OR s.created_by IS DISTINCT FROM me.uid)
  FROM public.staff_promotions s CROSS JOIN me
  JOIN public.profiles p ON p.id=s.profile_id
  LEFT JOIN public.org_units u ON u.id=p.org_unit_id
  LEFT JOIN public.ranks rk ON rk.id=s.to_rank_id
  WHERE s.status='pending' AND me.uid IS NOT NULL AND p.deleted_at IS NULL AND (me.adm OR public.is_command_head_for(me.uid, p.org_unit_id))
  ORDER BY 10 DESC;
$function$;