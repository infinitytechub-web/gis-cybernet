-- ═══════════════ 1. ATTENDANCE: reason + photo on each clock action ═══════════════
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS check_in_reason text,
  ADD COLUMN IF NOT EXISTS check_out_reason text,
  ADD COLUMN IF NOT EXISTS check_in_photo_path text,
  ADD COLUMN IF NOT EXISTS check_out_photo_path text;

CREATE OR REPLACE FUNCTION public.roster_clock_action(
  _profile_id uuid,
  _action text,
  _notes text DEFAULT NULL::text,
  _reason text DEFAULT NULL::text,
  _photo_path text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_self boolean;
  v_allowed boolean;
  v_today date := (now())::date;
  v_now timestamptz := now();
  v_shift_id uuid;
  v_shift_start time;
  v_shift_end time;
  v_grace int;
  v_early_in int;
  v_late_out int;
  v_rec public.attendances;
  v_status public.attendance_status := 'present';
  v_late int := 0;
  v_early int := 0;
  v_alert text := NULL;
  v_severity text := 'ok';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _action NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;
  IF length(COALESCE(_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Reason is too long (max 500 characters)';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _profile_id AND user_id = v_uid)
    INTO v_is_self;

  v_allowed := v_is_self
    OR public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'oic')
    OR public.has_role(v_uid, '2ic')
    OR public.has_role(v_uid, 'staff_officer')
    OR public.is_supervisor_for_profile(v_uid, _profile_id);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorised to record attendance for this officer';
  END IF;

  -- Someone clocking on another officer's behalf must say why.
  IF NOT v_is_self AND COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when clocking on behalf of another officer';
  END IF;

  SELECT s.id, s.start_time, s.end_time
    INTO v_shift_id, v_shift_start, v_shift_end
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.profile_id = _profile_id
    AND sa.start_date <= v_today
    AND (sa.end_date IS NULL OR sa.end_date >= v_today)
  ORDER BY sa.start_date DESC
  LIMIT 1;

  SELECT w.grace_minutes, w.early_checkin_minutes, w.late_checkout_minutes
    INTO v_grace, v_early_in, v_late_out
  FROM public.get_effective_attendance_window(v_shift_id) w;

  v_grace := COALESCE(v_grace, 15);
  v_early_in := COALESCE(v_early_in, 30);
  v_late_out := COALESCE(v_late_out, 60);

  SELECT * INTO v_rec
  FROM public.attendances
  WHERE profile_id = _profile_id AND date = v_today
  LIMIT 1;

  IF _action = 'check_in' THEN
    IF v_rec.id IS NOT NULL AND v_rec.check_in IS NOT NULL THEN
      RAISE EXCEPTION 'Already clocked in today at %', to_char(v_rec.check_in, 'HH24:MI');
    END IF;

    IF v_shift_start IS NOT NULL THEN
      v_late := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM ((v_now)::time - v_shift_start)) / 60)::int - v_grace
      );
      IF v_late > 0 THEN
        v_status := 'late';
        v_alert := format('Late clock-in: %s min past %s (grace %s min)',
                          v_late, to_char(v_shift_start, 'HH24:MI'), v_grace);
        v_severity := 'late';
      ELSIF EXTRACT(EPOCH FROM (v_shift_start - (v_now)::time)) / 60 > v_early_in THEN
        v_alert := format('Early clock-in: more than %s min before %s',
                          v_early_in, to_char(v_shift_start, 'HH24:MI'));
        v_severity := 'early';
      END IF;
    END IF;

    IF v_rec.id IS NULL THEN
      INSERT INTO public.attendances (profile_id, date, check_in, status, notes,
                                      check_in_reason, check_in_photo_path)
      VALUES (_profile_id, v_today, v_now, v_status, NULLIF(_notes, ''),
              NULLIF(btrim(_reason), ''), NULLIF(_photo_path, ''))
      RETURNING * INTO v_rec;
    ELSE
      UPDATE public.attendances
         SET check_in = v_now,
             status = v_status,
             notes = COALESCE(NULLIF(_notes, ''), notes),
             check_in_reason = COALESCE(NULLIF(btrim(_reason), ''), check_in_reason),
             check_in_photo_path = COALESCE(NULLIF(_photo_path, ''), check_in_photo_path),
             updated_at = now()
       WHERE id = v_rec.id
      RETURNING * INTO v_rec;
    END IF;
  ELSE
    IF v_rec.id IS NULL OR v_rec.check_in IS NULL THEN
      RAISE EXCEPTION 'No clock-in recorded today — clock in first';
    END IF;
    IF v_rec.check_out IS NOT NULL THEN
      RAISE EXCEPTION 'Already clocked out today at %', to_char(v_rec.check_out, 'HH24:MI');
    END IF;

    IF v_shift_end IS NOT NULL THEN
      v_early := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (v_shift_end - (v_now)::time)) / 60)::int
      );
      IF v_early > 0 THEN
        v_alert := format('Early clock-out: %s min before shift end %s',
                          v_early, to_char(v_shift_end, 'HH24:MI'));
        v_severity := 'early';
      ELSIF FLOOR(EXTRACT(EPOCH FROM ((v_now)::time - v_shift_end)) / 60)::int > v_late_out THEN
        v_alert := format('Late clock-out: more than %s min after %s',
                          v_late_out, to_char(v_shift_end, 'HH24:MI'));
        v_severity := 'late';
      END IF;
    END IF;

    UPDATE public.attendances
       SET check_out = v_now,
           notes = COALESCE(NULLIF(_notes, ''), notes),
           check_out_reason = NULLIF(btrim(_reason), ''),
           check_out_photo_path = NULLIF(_photo_path, ''),
           updated_at = now()
     WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    v_status := v_rec.status;
  END IF;

  RETURN jsonb_build_object(
    'attendance_id', v_rec.id,
    'profile_id', v_rec.profile_id,
    'date', v_rec.date,
    'action', _action,
    'status', v_rec.status,
    'check_in', v_rec.check_in,
    'check_out', v_rec.check_out,
    'reason', CASE WHEN _action = 'check_in' THEN v_rec.check_in_reason ELSE v_rec.check_out_reason END,
    'photo_path', CASE WHEN _action = 'check_in' THEN v_rec.check_in_photo_path ELSE v_rec.check_out_photo_path END,
    'shift_start', v_shift_start,
    'shift_end', v_shift_end,
    'grace_minutes', v_grace,
    'late_minutes', v_late,
    'early_minutes', v_early,
    'on_behalf', NOT v_is_self,
    'severity', v_severity,
    'alert', v_alert
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.roster_clock_action(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roster_clock_action(uuid, text, text, text, text) TO authenticated;

-- ═══════════════ 2. VEHICLE MAINTENANCE ═══════════════
CREATE TABLE IF NOT EXISTS public.fleet_maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  interval_km numeric,
  interval_days integer,
  last_service_odometer_km numeric,
  last_service_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, service_type)
);

GRANT SELECT ON public.fleet_maintenance_schedules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleet_maintenance_schedules TO authenticated;
GRANT ALL ON public.fleet_maintenance_schedules TO service_role;
ALTER TABLE public.fleet_maintenance_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read maintenance schedules"
  ON public.fleet_maintenance_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Fleet managers manage maintenance schedules"
  ON public.fleet_maintenance_schedules FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.fleet_maintenance_schedules(id) ON DELETE SET NULL,
  service_type text NOT NULL,
  service_date date NOT NULL DEFAULT (now())::date,
  odometer_km numeric,
  cost numeric,
  workshop text,
  parts_replaced text,
  downtime_days numeric,
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fleet_maintenance_records TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleet_maintenance_records TO authenticated;
GRANT ALL ON public.fleet_maintenance_records TO service_role;
ALTER TABLE public.fleet_maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read maintenance records"
  ON public.fleet_maintenance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Fleet managers manage maintenance records"
  ON public.fleet_maintenance_records FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE INDEX IF NOT EXISTS fleet_maintenance_records_vehicle_idx
  ON public.fleet_maintenance_records (vehicle_id, service_date DESC);

CREATE TRIGGER fleet_maintenance_schedules_updated_at
  BEFORE UPDATE ON public.fleet_maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER fleet_maintenance_records_updated_at
  BEFORE UPDATE ON public.fleet_maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logging a completed service pushes the vehicle odometer forward and refreshes the schedule.
CREATE OR REPLACE FUNCTION public.fleet_maintenance_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current numeric;
BEGIN
  IF NEW.odometer_km IS NOT NULL AND NEW.odometer_km < 0 THEN
    RAISE EXCEPTION 'Odometer reading cannot be negative';
  END IF;

  IF NEW.odometer_km IS NOT NULL THEN
    SELECT odometer_km INTO v_current FROM public.fleet_vehicles WHERE id = NEW.vehicle_id;
    IF COALESCE(v_current, 0) < NEW.odometer_km THEN
      UPDATE public.fleet_vehicles
         SET odometer_km = NEW.odometer_km, updated_at = now()
       WHERE id = NEW.vehicle_id;
    END IF;
  END IF;

  IF NEW.status = 'completed' THEN
    UPDATE public.fleet_maintenance_schedules s
       SET last_service_date = NEW.service_date,
           last_service_odometer_km = COALESCE(NEW.odometer_km, s.last_service_odometer_km),
           updated_at = now()
     WHERE s.vehicle_id = NEW.vehicle_id
       AND (NEW.schedule_id = s.id OR (NEW.schedule_id IS NULL AND s.service_type = NEW.service_type));
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER fleet_maintenance_records_apply
  AFTER INSERT OR UPDATE ON public.fleet_maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.fleet_maintenance_apply();

-- Per-vehicle maintenance status for the Fleet Dashboard.
CREATE OR REPLACE FUNCTION public.fleet_maintenance_status()
RETURNS TABLE (
  vehicle_id uuid,
  registration_number text,
  call_sign text,
  org_unit_name text,
  odometer_km numeric,
  service_type text,
  interval_km numeric,
  interval_days integer,
  last_service_date date,
  last_service_odometer_km numeric,
  next_due_km numeric,
  next_due_date date,
  km_remaining numeric,
  days_remaining integer,
  due_state text,
  services_12m bigint,
  cost_12m numeric,
  downtime_12m numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT v.id AS vehicle_id,
           v.registration_number,
           v.call_sign,
           u.name AS org_unit_name,
           v.odometer_km,
           s.service_type,
           s.interval_km,
           s.interval_days,
           s.last_service_date,
           s.last_service_odometer_km,
           CASE WHEN s.interval_km IS NOT NULL
                THEN COALESCE(s.last_service_odometer_km, 0) + s.interval_km END AS next_due_km,
           CASE WHEN s.interval_days IS NOT NULL AND s.last_service_date IS NOT NULL
                THEN s.last_service_date + s.interval_days END AS next_due_date
    FROM public.fleet_vehicles v
    LEFT JOIN public.org_units u ON u.id = v.org_unit_id
    LEFT JOIN public.fleet_maintenance_schedules s
           ON s.vehicle_id = v.id AND s.is_active
    WHERE v.status <> 'decommissioned'
  ), agg AS (
    SELECT r.vehicle_id,
           count(*) AS services_12m,
           COALESCE(sum(r.cost), 0) AS cost_12m,
           COALESCE(sum(r.downtime_days), 0) AS downtime_12m
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
         COALESCE(a.services_12m, 0) AS services_12m,
         COALESCE(a.cost_12m, 0) AS cost_12m,
         COALESCE(a.downtime_12m, 0) AS downtime_12m
  FROM base b
  LEFT JOIN agg a ON a.vehicle_id = b.vehicle_id
  ORDER BY b.registration_number, b.service_type;
$function$;

REVOKE ALL ON FUNCTION public.fleet_maintenance_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_maintenance_status() TO authenticated;

-- ═══════════════ 3. PROCUREMENT BUDGETS PER UNIT / BRANCH ═══════════════
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.procurement_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid NOT NULL REFERENCES public.org_units(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  budget_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_unit_id, fiscal_year)
);

GRANT SELECT ON public.procurement_budgets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.procurement_budgets TO authenticated;
GRANT ALL ON public.procurement_budgets TO service_role;
ALTER TABLE public.procurement_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read procurement budgets"
  ON public.procurement_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Procurement tier manages budgets"
  ON public.procurement_budgets FOR ALL TO authenticated
  USING (public.can_manage_procurement(auth.uid()))
  WITH CHECK (public.can_manage_procurement(auth.uid()));

CREATE TRIGGER procurement_budgets_updated_at
  BEFORE UPDATE ON public.procurement_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.procurement_budget_status(_fiscal_year integer DEFAULT NULL)
RETURNS TABLE (
  org_unit_id uuid,
  org_unit_name text,
  org_unit_code text,
  fiscal_year integer,
  budget_amount numeric,
  currency text,
  committed numeric,
  pending numeric,
  remaining numeric,
  utilisation_pct numeric,
  request_count bigint,
  over_budget boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH yr AS (SELECT COALESCE(_fiscal_year, EXTRACT(YEAR FROM now())::int) AS y),
  spend AS (
    SELECT r.org_unit_id,
           COALESCE(SUM(CASE WHEN r.status IN ('approved', 'partial', 'received')
                             THEN COALESCE(r.estimated_cost, 0) ELSE 0 END), 0) AS committed,
           COALESCE(SUM(CASE WHEN r.status = 'submitted'
                             THEN COALESCE(r.estimated_cost, 0) ELSE 0 END), 0) AS pending,
           COUNT(*) FILTER (WHERE r.status <> 'draft') AS request_count
    FROM public.purchase_requisitions r, yr
    WHERE r.org_unit_id IS NOT NULL
      AND EXTRACT(YEAR FROM r.created_at)::int = yr.y
    GROUP BY r.org_unit_id
  )
  SELECT u.id,
         u.name,
         u.code,
         (SELECT y FROM yr),
         COALESCE(b.budget_amount, 0),
         COALESCE(b.currency, 'GHS'),
         COALESCE(s.committed, 0),
         COALESCE(s.pending, 0),
         COALESCE(b.budget_amount, 0) - COALESCE(s.committed, 0) - COALESCE(s.pending, 0) AS remaining,
         CASE WHEN COALESCE(b.budget_amount, 0) > 0
              THEN ROUND(((COALESCE(s.committed, 0) + COALESCE(s.pending, 0)) / b.budget_amount) * 100, 1)
              ELSE NULL END AS utilisation_pct,
         COALESCE(s.request_count, 0),
         (COALESCE(b.budget_amount, 0) > 0
           AND COALESCE(s.committed, 0) + COALESCE(s.pending, 0) > b.budget_amount) AS over_budget
  FROM public.org_units u
  LEFT JOIN public.procurement_budgets b
         ON b.org_unit_id = u.id AND b.fiscal_year = (SELECT y FROM yr)
  LEFT JOIN spend s ON s.org_unit_id = u.id
  WHERE u.is_active
    AND (b.id IS NOT NULL OR s.org_unit_id IS NOT NULL)
  ORDER BY u.name;
$function$;

REVOKE ALL ON FUNCTION public.procurement_budget_status(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_budget_status(integer) TO authenticated;