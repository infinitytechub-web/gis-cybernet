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

  SELECT org_unit_id INTO home FROM public.profiles WHERE user_id = _user_id;

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
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;