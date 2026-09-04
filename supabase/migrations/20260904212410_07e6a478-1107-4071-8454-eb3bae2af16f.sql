-- 1) Optional map coordinates on org units
ALTER TABLE public.org_units
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- 2) Staff mapping feed -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_mapping_rows()
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  rank_abbr text,
  department_name text,
  unit text,
  status text,
  shift_group text,
  photo_url text,
  org_unit_id uuid,
  org_unit_name text,
  station_name text,
  sector_name text,
  region_name text,
  latitude numeric,
  longitude numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_all := public.is_command_tier(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'staff_officer')
        OR public.has_role(auth.uid(), 'head_of_administration');

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT u.id AS root_id, u.id, u.name, u.type, u.parent_id, u.latitude, u.longitude, 0 AS depth
    FROM public.org_units u
    UNION ALL
    SELECT c.root_id, p.id, p.name, p.type, p.parent_id, p.latitude, p.longitude, c.depth + 1
    FROM chain c
    JOIN public.org_units p ON p.id = c.parent_id
  ),
  resolved AS (
    SELECT
      root_id,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type IN ('station','unit')))[1] AS station_name,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type = 'sector'))[1] AS sector_name,
      (ARRAY_AGG(name ORDER BY depth) FILTER (WHERE type = 'regional'))[1] AS region_name,
      (ARRAY_AGG(latitude ORDER BY depth) FILTER (WHERE latitude IS NOT NULL))[1] AS lat,
      (ARRAY_AGG(longitude ORDER BY depth) FILTER (WHERE longitude IS NOT NULL))[1] AS lng
    FROM chain
    GROUP BY root_id
  )
  SELECT
    p.id,
    p.staff_id,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name)),
    r.name,
    r.abbreviation,
    d.name,
    p.unit,
    p.status,
    p.shift_group,
    p.photo_url,
    p.org_unit_id,
    ou.name,
    res.station_name,
    res.sector_name,
    res.region_name,
    COALESCE(res.lat, cap.lat),
    COALESCE(res.lng, cap.lng)
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.org_units ou ON ou.id = p.org_unit_id
  LEFT JOIN resolved res ON res.root_id = p.org_unit_id
  LEFT JOIN LATERAL (
    SELECT g.lat, g.lng
    FROM public.ghana_regional_capitals g
    WHERE res.region_name IS NOT NULL
      AND REPLACE(LOWER(res.region_name), ' regional command', '') LIKE '%' || LOWER(g.region) || '%'
    LIMIT 1
  ) cap ON true
  WHERE v_all OR public.can_see_org_unit(auth.uid(), p.org_unit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_mapping_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mapping_rows() TO authenticated;

-- 3) Live duty feed ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duty_roster_live(_date date DEFAULT CURRENT_DATE, _group text DEFAULT NULL)
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_abbr text,
  rank_name text,
  department_name text,
  unit text,
  shift_group text,
  status text,
  photo_url text,
  on_duty boolean,
  check_in timestamptz,
  check_out timestamptz,
  attendance_status text,
  org_unit_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.staff_id,
    TRIM(CONCAT_WS(' ', p.first_name, p.last_name)),
    r.abbreviation,
    r.name,
    d.name,
    p.unit,
    p.shift_group,
    p.status,
    p.photo_url,
    (_group IS NOT NULL AND UPPER(COALESCE(p.shift_group, '')) = UPPER(_group)),
    a.check_in,
    a.check_out,
    a.status::text,
    ou.name
  FROM public.profiles p
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.org_units ou ON ou.id = p.org_unit_id
  LEFT JOIN public.attendances a ON a.profile_id = p.id AND a.date = _date
  WHERE COALESCE(p.status, 'active') = 'active'
    AND p.shift_group IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.duty_roster_live(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_roster_live(date, text) TO authenticated;

-- 4) Staff self-service bio-data change requests ------------------------------
CREATE OR REPLACE FUNCTION public.apply_profile_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  k TEXT;
  v TEXT;
  has_restricted BOOLEAN := false;
  med_fields TEXT[] := ARRAY[]::TEXT[];
  bank_fields TEXT[] := ARRAY[]::TEXT[];
  allowed TEXT[] := ARRAY[
    'first_name','last_name','other_names','gender','date_of_birth','marital_status',
    'phone','email','ghana_card_number','blood_group','office',
    'training_designation','staff_category','photo_url',
    'place_of_birth','hometown','region_of_origin',
    'current_place_of_stay','residential_address','digital_address','postal_address',
    'residential_phone','height_cm','uniform_size','shoe_size','religion',
    'hobbies','special_skills','number_of_children',
    'previous_last_position','previous_reason_for_leaving'
  ];
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_object_keys(NEW.requested_changes) key
      WHERE key LIKE 'medical.%' OR key LIKE 'bank.%'
    ) INTO has_restricted;

    IF has_restricted AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only an administrator can approve restricted medical or bank changes';
    END IF;

    FOR k, v IN SELECT key, value::text FROM jsonb_each_text(NEW.requested_changes) LOOP
      IF k = ANY(allowed) THEN
        EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
          USING NULLIF(v, ''), NEW.profile_id;
      ELSIF k IN ('medical.medical_conditions', 'medical.welfare_notes') THEN
        INSERT INTO public.staff_medical_welfare (profile_id) VALUES (NEW.profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
        EXECUTE format('UPDATE public.staff_medical_welfare SET %I = $1, updated_at = now() WHERE profile_id = $2',
                       SPLIT_PART(k, '.', 2))
          USING NULLIF(v, ''), NEW.profile_id;
        med_fields := med_fields || SPLIT_PART(k, '.', 2);
      ELSIF k IN ('bank.bank_name', 'bank.branch', 'bank.account_number') THEN
        INSERT INTO public.staff_bank_details (profile_id) VALUES (NEW.profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
        EXECUTE format('UPDATE public.staff_bank_details SET %I = $1, updated_at = now() WHERE profile_id = $2',
                       SPLIT_PART(k, '.', 2))
          USING NULLIF(v, ''), NEW.profile_id;
        bank_fields := bank_fields || SPLIT_PART(k, '.', 2);
      END IF;
    END LOOP;

    IF array_length(med_fields, 1) > 0 THEN
      INSERT INTO public.biodata_restricted_access_log (profile_id, section, action, actor_id, changed_fields, details)
      VALUES (NEW.profile_id, 'medical', 'edit', auth.uid(), med_fields,
              jsonb_build_object('source', 'approved_change_request', 'request_id', NEW.id));
    END IF;
    IF array_length(bank_fields, 1) > 0 THEN
      INSERT INTO public.biodata_restricted_access_log (profile_id, section, action, actor_id, changed_fields, details)
      VALUES (NEW.profile_id, 'bank', 'edit', auth.uid(), bank_fields,
              jsonb_build_object('source', 'approved_change_request', 'request_id', NEW.id));
    END IF;

    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;