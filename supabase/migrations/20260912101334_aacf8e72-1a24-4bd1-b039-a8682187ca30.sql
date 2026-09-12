CREATE OR REPLACE FUNCTION public.commit_staff_list_import(_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imp public.staff_list_imports;
  v_row record;
  v_norm_rank text;
  v_rank_id uuid;
  v_unit_id uuid;
  v_unit_name text;
  v_parent_code text;
  v_code text;
  v_profile_id uuid;
  v_staff_id text;
  v_new int := 0;
  v_matched int := 0;
  v_ranks int := 0;
  v_units int := 0;
  v_retired int := 0;
  v_touched uuid[] := '{}';
  v_created uuid[] := '{}';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only System Administrators can commit a staff list import';
  END IF;

  SELECT * INTO v_imp FROM public.staff_list_imports WHERE id = _import_id;
  IF v_imp.id IS NULL THEN
    RAISE EXCEPTION 'Import not found';
  END IF;
  IF v_imp.status = 'committed' THEN
    RAISE EXCEPTION 'This import has already been committed';
  END IF;
  IF v_imp.target_org_unit_id IS NULL THEN
    RAISE EXCEPTION 'Choose the command to import into first';
  END IF;

  SELECT code INTO v_parent_code FROM public.org_units WHERE id = v_imp.target_org_unit_id;

  FOR v_row IN
    SELECT * FROM public.staff_list_import_rows
    WHERE import_id = _import_id AND outcome = 'ready'
    ORDER BY row_no
  LOOP
    v_rank_id := NULL;
    v_norm_rank := btrim(regexp_replace(upper(coalesce(v_row.payload->>'rank','')), '[^A-Z0-9 ]', '', 'g'));
    v_norm_rank := regexp_replace(v_norm_rank, '\s+', ' ', 'g');
    IF v_norm_rank <> '' THEN
      SELECT id INTO v_rank_id FROM public.ranks
      WHERE regexp_replace(btrim(regexp_replace(upper(name), '[^A-Z0-9 ]', '', 'g')), '\s+', ' ', 'g') = v_norm_rank
         OR regexp_replace(btrim(regexp_replace(upper(abbreviation), '[^A-Z0-9 ]', '', 'g')), '\s+', ' ', 'g') = v_norm_rank
      LIMIT 1;
      IF v_rank_id IS NULL THEN
        INSERT INTO public.ranks (name, abbreviation, level)
        VALUES (v_norm_rank, v_norm_rank, 0)
        RETURNING id INTO v_rank_id;
        v_ranks := v_ranks + 1;
      END IF;
    END IF;

    v_unit_id := NULL;
    v_unit_name := btrim(coalesce(v_row.payload->>'unit',''));
    IF v_unit_name <> '' THEN
      SELECT id INTO v_unit_id FROM public.org_units
      WHERE parent_id = v_imp.target_org_unit_id AND upper(btrim(name)) = upper(v_unit_name)
      LIMIT 1;
      IF v_unit_id IS NULL THEN
        v_code := coalesce(v_parent_code,'ORG') || '-' ||
                  substr(regexp_replace(upper(v_unit_name), '[^A-Z0-9]', '', 'g'), 1, 6);
        WHILE EXISTS (SELECT 1 FROM public.org_units WHERE code = v_code) LOOP
          v_code := v_code || floor(random() * 10)::int::text;
        END LOOP;
        INSERT INTO public.org_units (name, code, type, parent_id, is_active)
        VALUES (initcap(v_unit_name), v_code, 'unit', v_imp.target_org_unit_id, true)
        RETURNING id INTO v_unit_id;
        v_units := v_units + 1;
      END IF;
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles
    WHERE upper(btrim(first_name)) = upper(btrim(coalesce(v_row.payload->>'first_name','')))
      AND upper(btrim(last_name)) = upper(btrim(coalesce(v_row.payload->>'last_name','')))
    LIMIT 1;

    IF v_profile_id IS NOT NULL THEN
      UPDATE public.profiles SET
        rank_id = coalesce(v_rank_id, rank_id),
        org_unit_id = coalesce(v_unit_id, org_unit_id),
        unit = coalesce(nullif(v_unit_name,''), unit),
        shift_group = coalesce(nullif(btrim(coalesce(v_row.payload->>'shift','')),''), shift_group),
        phone = coalesce(nullif(btrim(coalesce(v_row.payload->>'phone','')),''), phone),
        gender = coalesce(nullif(btrim(coalesce(v_row.payload->>'gender','')),''), gender),
        intake = coalesce((nullif(btrim(coalesce(v_row.payload->>'intake','')),''))::int, intake),
        status = 'active',
        updated_at = now()
      WHERE id = v_profile_id;
      v_matched := v_matched + 1;
    ELSE
      LOOP
        v_staff_id := 'GIS-' || lpad(nextval('public.staff_list_staff_no_seq')::text, 5, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE staff_id = v_staff_id);
      END LOOP;
      INSERT INTO public.profiles (
        staff_id, first_name, last_name, rank_id, org_unit_id, unit, shift_group,
        phone, gender, intake, status, login_enabled
      ) VALUES (
        v_staff_id,
        initcap(btrim(coalesce(v_row.payload->>'first_name','Unknown'))),
        initcap(btrim(coalesce(v_row.payload->>'last_name','Unknown'))),
        v_rank_id, v_unit_id, nullif(v_unit_name,''),
        nullif(btrim(coalesce(v_row.payload->>'shift','')),''),
        nullif(btrim(coalesce(v_row.payload->>'phone','')),''),
        nullif(btrim(coalesce(v_row.payload->>'gender','')),''),
        (nullif(btrim(coalesce(v_row.payload->>'intake','')),''))::int,
        'active', true
      ) RETURNING id INTO v_profile_id;
      v_new := v_new + 1;
      v_created := v_created || v_profile_id;
    END IF;

    v_touched := v_touched || v_profile_id;
    UPDATE public.staff_list_import_rows
      SET profile_id = v_profile_id, outcome = 'committed'
      WHERE id = v_row.id;
  END LOOP;

  -- The uploaded list is authoritative for this command: anyone posted inside it
  -- but absent from the file is retired (kept, never deleted) so their
  -- attendance, leave and audit history survives.
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.org_units WHERE id = v_imp.target_org_unit_id
    UNION ALL
    SELECT o.id FROM public.org_units o JOIN subtree s ON o.parent_id = s.id
  ), retired AS (
    UPDATE public.profiles p
      SET status = 'inactive', org_unit_id = NULL, updated_at = now()
    WHERE p.org_unit_id IN (SELECT id FROM subtree)
      AND NOT (p.id = ANY(v_touched))
      AND p.status <> 'inactive'
    RETURNING p.id
  )
  SELECT count(*) INTO v_retired FROM retired;

  UPDATE public.staff_list_imports SET
    status = 'committed',
    committed_at = now(),
    new_count = v_new,
    matched_count = v_matched,
    retired_count = v_retired,
    ranks_created = v_ranks,
    units_created = v_units
  WHERE id = _import_id;

  RETURN jsonb_build_object(
    'new', v_new, 'matched', v_matched, 'retired', v_retired,
    'ranks_created', v_ranks, 'units_created', v_units,
    'created_profile_ids', to_jsonb(v_created)
  );
END;
$function$;