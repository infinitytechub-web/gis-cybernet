-- 1. PATROL LOGS ------------------------------------------------------------
CREATE TABLE public.patrol_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patrol_reference text NOT NULL UNIQUE,
  patrol_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time time NOT NULL,
  end_time time,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  district_name text,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  patrol_type text NOT NULL DEFAULT 'routine',
  patrol_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  personnel_count integer NOT NULL DEFAULT 0,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  route_summary text,
  incidents_count integer NOT NULL DEFAULT 0,
  incidents text,
  observations text,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrol_logs_status_chk CHECK (status IN ('draft','submitted','reviewed','closed')),
  CONSTRAINT patrol_logs_personnel_chk CHECK (personnel_count >= 0),
  CONSTRAINT patrol_logs_incidents_chk CHECK (incidents_count >= 0)
);

CREATE INDEX patrol_logs_date_idx ON public.patrol_logs (patrol_date DESC);
CREATE INDEX patrol_logs_unit_idx ON public.patrol_logs (org_unit_id);
CREATE INDEX patrol_logs_district_idx ON public.patrol_logs (district_id);
CREATE INDEX patrol_logs_leader_idx ON public.patrol_logs (patrol_leader_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrol_logs TO authenticated;
GRANT ALL ON public.patrol_logs TO service_role;
ALTER TABLE public.patrol_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patrol logs visible within own unit branch"
ON public.patrol_logs FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR (org_unit_id IS NOT NULL AND public.can_view_org_unit(auth.uid(), org_unit_id))
  OR (org_unit_id IS NULL AND public.is_command_tier(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Staff log their own patrols"
ON public.patrol_logs FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    org_unit_id IS NULL
    OR public.can_view_org_unit(auth.uid(), org_unit_id)
  )
);

CREATE POLICY "Authors edit drafts, command tier reviews branch patrols"
ON public.patrol_logs FOR UPDATE TO authenticated
USING (
  (created_by = auth.uid() AND status IN ('draft','submitted'))
  OR (public.is_command_tier(auth.uid())
      AND (org_unit_id IS NULL OR org_unit_id IN (SELECT public.command_reach_units(auth.uid()))))
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (created_by = auth.uid() AND status IN ('draft','submitted'))
  OR (public.is_command_tier(auth.uid())
      AND (org_unit_id IS NULL OR org_unit_id IN (SELECT public.command_reach_units(auth.uid()))))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authors remove drafts, admins remove any patrol"
ON public.patrol_logs FOR DELETE TO authenticated
USING (
  (created_by = auth.uid() AND status = 'draft')
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER trg_patrol_logs_updated_at
BEFORE UPDATE ON public.patrol_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Automatic reference: PTL-YYYYMMDD-0001
CREATE OR REPLACE FUNCTION public.set_patrol_log_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq integer;
BEGIN
  IF NEW.patrol_reference IS NOT NULL AND NEW.patrol_reference <> '' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) + 1 INTO seq FROM public.patrol_logs WHERE patrol_date = NEW.patrol_date;
  NEW.patrol_reference := 'PTL-' || to_char(NEW.patrol_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.patrol_logs WHERE patrol_reference = NEW.patrol_reference) LOOP
    seq := seq + 1;
    NEW.patrol_reference := 'PTL-' || to_char(NEW.patrol_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patrol_logs_reference
BEFORE INSERT ON public.patrol_logs
FOR EACH ROW EXECUTE FUNCTION public.set_patrol_log_reference();

-- Snapshot the district name so reports stay readable if the register changes.
CREATE OR REPLACE FUNCTION public.sync_patrol_log_district()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.district_id IS NOT NULL THEN
    SELECT d.name INTO NEW.district_name FROM public.ghana_districts d WHERE d.id = NEW.district_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patrol_logs_district
BEFORE INSERT OR UPDATE OF district_id ON public.patrol_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_patrol_log_district();

-- 2. PATROL LOG PHOTOS ------------------------------------------------------
CREATE TABLE public.patrol_log_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patrol_log_id uuid NOT NULL REFERENCES public.patrol_logs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patrol_log_photos_log_idx ON public.patrol_log_photos (patrol_log_id);

GRANT SELECT, INSERT, DELETE ON public.patrol_log_photos TO authenticated;
GRANT ALL ON public.patrol_log_photos TO service_role;
ALTER TABLE public.patrol_log_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patrol photos visible with the patrol log"
ON public.patrol_log_photos FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.patrol_logs p
  WHERE p.id = patrol_log_photos.patrol_log_id
    AND (
      p.created_by = auth.uid()
      OR (p.org_unit_id IS NOT NULL AND public.can_view_org_unit(auth.uid(), p.org_unit_id))
      OR (p.org_unit_id IS NULL AND public.is_command_tier(auth.uid()))
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
));

CREATE POLICY "Staff attach photos to reachable patrol logs"
ON public.patrol_log_photos FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.patrol_logs p
    WHERE p.id = patrol_log_photos.patrol_log_id
      AND (
        p.created_by = auth.uid()
        OR (p.org_unit_id IS NOT NULL AND public.can_view_org_unit(auth.uid(), p.org_unit_id))
        OR public.is_command_tier(auth.uid())
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "Uploader or admin removes patrol photos"
ON public.patrol_log_photos FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. PRIVATE PHOTO BUCKET POLICIES ------------------------------------------
CREATE POLICY "Staff read patrol photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'patrol-photos' AND (owner = auth.uid() OR public.is_command_tier(auth.uid())));

CREATE POLICY "Staff upload patrol photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'patrol-photos' AND owner = auth.uid());

CREATE POLICY "Owner or admin removes patrol photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'patrol-photos' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)));

-- 4. UNIT DASHBOARD: include patrol activity --------------------------------
CREATE OR REPLACE FUNCTION public.unit_dashboard(_org_unit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  unit public.org_units;
  units uuid[];
  profile_ids uuid[];
  user_ids uuid[];
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
  SELECT array_agg(p.id), array_agg(p.user_id) INTO profile_ids, user_ids
  FROM public.profiles p WHERE p.org_unit_id = ANY(units);
  profile_ids := COALESCE(profile_ids, ARRAY[]::uuid[]);
  user_ids := COALESCE(user_ids, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'unit', jsonb_build_object('id', unit.id, 'name', unit.name, 'code', unit.code, 'type', unit.type),
    'unit_ids', to_jsonb(units),
    'staff', COALESCE((
      SELECT jsonb_agg(s ORDER BY s->>'full_name')
      FROM (
        SELECT jsonb_build_object(
          'id', p.id,
          'full_name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
          'staff_id', p.staff_id,
          'status', p.status,
          'rank', r.name,
          'department', dp.name,
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
        WHERE dr.arresting_officer_id = ANY(profile_ids)
           OR dr.officer_in_charge_id = ANY(profile_ids)
           OR dr.created_by = ANY(user_ids)
        ORDER BY dr.intake_at DESC
        LIMIT 200
      ) q
    ), '[]'::jsonb),
    'detainees_in_custody', (
      SELECT count(*) FROM public.detention_records dr
      WHERE dr.status = 'in_custody'
        AND (dr.arresting_officer_id = ANY(profile_ids) OR dr.officer_in_charge_id = ANY(profile_ids) OR dr.created_by = ANY(user_ids))
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
        WHERE o.officer_in_charge = ANY(profile_ids)
           OR o.authorized_by = ANY(profile_ids)
           OR o.reported_by = ANY(user_ids)
        ORDER BY o.operation_date DESC
        LIMIT 200
      ) q
    ), '[]'::jsonb),
    'cases_open', (
      SELECT count(*) FROM public.operations o
      WHERE o.status IN ('open', 'in_progress')
        AND (o.officer_in_charge = ANY(profile_ids) OR o.authorized_by = ANY(profile_ids) OR o.reported_by = ANY(user_ids))
    ),
    'vehicles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'registration_number', v.registration_number, 'call_sign', v.call_sign,
        'status', v.status, 'last_seen_at', v.last_seen_at
      ))
      FROM public.fleet_vehicles v
      WHERE v.org_unit_id = ANY(units)
    ), '[]'::jsonb),
    'patrols', COALESCE((
      SELECT jsonb_agg(pl ORDER BY pl->>'patrol_date' DESC, pl->>'start_time' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id,
          'patrol_reference', p.patrol_reference,
          'patrol_date', p.patrol_date,
          'start_time', p.start_time,
          'end_time', p.end_time,
          'district_name', p.district_name,
          'patrol_type', p.patrol_type,
          'status', p.status,
          'personnel_count', p.personnel_count,
          'incidents_count', p.incidents_count,
          'incidents', p.incidents,
          'leader_name', trim(coalesce(lp.first_name, '') || ' ' || coalesce(lp.last_name, ''))
        ) AS pl
        FROM public.patrol_logs p
        LEFT JOIN public.profiles lp ON lp.id = p.patrol_leader_id
        WHERE p.org_unit_id = ANY(units)
           OR p.patrol_leader_id = ANY(profile_ids)
        ORDER BY p.patrol_date DESC, p.start_time DESC
        LIMIT 200
      ) q
    ), '[]'::jsonb),
    'patrols_recent', (
      SELECT count(*) FROM public.patrol_logs p
      WHERE p.patrol_date >= (CURRENT_DATE - 30)
        AND (p.org_unit_id = ANY(units) OR p.patrol_leader_id = ANY(profile_ids))
    ),
    'patrol_incidents_recent', (
      SELECT COALESCE(sum(p.incidents_count), 0) FROM public.patrol_logs p
      WHERE p.patrol_date >= (CURRENT_DATE - 30)
        AND (p.org_unit_id = ANY(units) OR p.patrol_leader_id = ANY(profile_ids))
    )
  ) INTO result;

  RETURN result;
END;
$function$;