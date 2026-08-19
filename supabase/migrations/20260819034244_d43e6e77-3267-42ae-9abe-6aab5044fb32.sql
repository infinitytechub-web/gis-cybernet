-- ============================================================
-- COMMAND DASHBOARD + CYBER INCIDENT MODULE + INCIDENT PHOTOS
-- ============================================================

-- 1. Branch reach: the set of commands an officer may see.
--    National command roles (admin/oic/2ic) reach everything; everyone else
--    reaches only their posting and its descendants, plus explicit grants.
CREATE OR REPLACE FUNCTION public.command_reach_units(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.org_units u
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role::text IN ('admin', 'oic', '2ic')
  )
  UNION
  SELECT d
  FROM public.profiles p
  CROSS JOIN public.org_unit_descendants(p.org_unit_id) d
  WHERE p.user_id = _user_id AND p.org_unit_id IS NOT NULL
  UNION
  SELECT d
  FROM public.org_unit_assignments a
  CROSS JOIN public.org_unit_descendants(a.org_unit_id) d
  WHERE a.user_id = _user_id
    AND a.revoked_at IS NULL
    AND (a.expires_at IS NULL OR a.expires_at > now());
$$;

REVOKE ALL ON FUNCTION public.command_reach_units(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_reach_units(uuid) TO authenticated, service_role;

-- 2. Cyber incident module fields
ALTER TABLE public.cyber_incidents
  ADD COLUMN IF NOT EXISTS org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impact_level text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS threat_source text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

UPDATE public.cyber_incidents c
SET org_unit_id = p.org_unit_id
FROM public.profiles p
WHERE p.user_id = c.reported_by
  AND c.org_unit_id IS NULL
  AND p.org_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cyber_incidents_org_unit_idx
  ON public.cyber_incidents (org_unit_id);

-- Stamp the reporter's command and resolution owner automatically.
CREATE OR REPLACE FUNCTION public.cyber_incident_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_unit_id IS NULL THEN
    SELECT org_unit_id INTO NEW.org_unit_id
    FROM public.profiles WHERE user_id = COALESCE(NEW.reported_by, auth.uid());
  END IF;

  IF lower(COALESCE(NEW.status, '')) IN ('resolved', 'closed') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    NEW.resolved_by := COALESCE(NEW.resolved_by, auth.uid());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cyber_incident_defaults_trg ON public.cyber_incidents;
CREATE TRIGGER cyber_incident_defaults_trg
  BEFORE INSERT OR UPDATE ON public.cyber_incidents
  FOR EACH ROW EXECUTE FUNCTION public.cyber_incident_defaults();

-- Branch-scoped access: replace the blanket supervisor policies.
DROP POLICY IF EXISTS "Supervisors view cyber incidents" ON public.cyber_incidents;
DROP POLICY IF EXISTS "Supervisors update cyber incidents" ON public.cyber_incidents;
DROP POLICY IF EXISTS "Supervisors create cyber incidents" ON public.cyber_incidents;

CREATE POLICY "Cyber incidents visible in own branch"
  ON public.cyber_incidents FOR SELECT TO authenticated
  USING (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      public.is_command_tier(auth.uid())
      AND (
        org_unit_id IS NULL
        OR org_unit_id IN (SELECT public.command_reach_units(auth.uid()))
      )
    )
  );

CREATE POLICY "Command staff log cyber incidents"
  ON public.cyber_incidents FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND (
      public.is_command_tier(auth.uid())
      OR public.has_role(auth.uid(), 'shift_supervisor'::app_role)
      OR public.has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
    )
  );

CREATE POLICY "Command staff update cyber incidents in branch"
  ON public.cyber_incidents FOR UPDATE TO authenticated
  USING (
    public.is_command_tier(auth.uid())
    AND (
      org_unit_id IS NULL
      OR org_unit_id IN (SELECT public.command_reach_units(auth.uid()))
    )
  )
  WITH CHECK (
    public.is_command_tier(auth.uid())
    AND (
      org_unit_id IS NULL
      OR org_unit_id IN (SELECT public.command_reach_units(auth.uid()))
    )
  );

-- 3. Incident photos attached to command alerts
CREATE TABLE IF NOT EXISTS public.command_alert_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.command_alerts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.command_alert_photos TO authenticated;
GRANT ALL ON public.command_alert_photos TO service_role;

ALTER TABLE public.command_alert_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alert photos visible with the alert"
  ON public.command_alert_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.command_alerts a
      WHERE a.id = alert_id
        AND (
          a.created_by = auth.uid()
          OR a.assigned_to = auth.uid()
          OR (
            public.is_command_tier(auth.uid())
            AND (
              a.org_unit_id IS NULL
              OR a.org_unit_id IN (SELECT public.command_reach_units(auth.uid()))
            )
          )
        )
    )
  );

CREATE POLICY "Command staff attach alert photos"
  ON public.command_alert_photos FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.is_command_tier(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.command_alerts a
      WHERE a.id = alert_id
        AND (
          a.org_unit_id IS NULL
          OR a.org_unit_id IN (SELECT public.command_reach_units(auth.uid()))
        )
    )
  );

CREATE POLICY "Uploader or admin removes alert photos"
  ON public.command_alert_photos FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS command_alert_photos_alert_idx
  ON public.command_alert_photos (alert_id);

-- Access rules for the private command-incidents storage area
DROP POLICY IF EXISTS "Command staff read incident photos" ON storage.objects;
CREATE POLICY "Command staff read incident photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'command-incidents' AND public.is_command_tier(auth.uid()));

DROP POLICY IF EXISTS "Command staff upload incident photos" ON storage.objects;
CREATE POLICY "Command staff upload incident photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'command-incidents'
    AND public.is_command_tier(auth.uid())
  );

DROP POLICY IF EXISTS "Owner removes incident photos" ON storage.objects;
CREATE POLICY "Owner removes incident photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'command-incidents'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 4. Command dashboard rollup: attendance, vehicle readiness, fuel, open alerts
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
    SELECT u.id, u.name, u.unit_type::text AS unit_type, u.parent_id
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

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.command_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_dashboard(integer) TO authenticated, service_role;