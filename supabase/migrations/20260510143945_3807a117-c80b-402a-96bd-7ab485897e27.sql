
CREATE OR REPLACE FUNCTION public.auto_deploy_roster_assignments(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eff_date date;
  v_match record;
  v_shift_id uuid;
  v_assigned int := 0;
  v_skipped int := 0;
  v_missing_shift int := 0;
BEGIN
  IF NOT public.is_roster_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT effective_date INTO v_eff_date
  FROM public.duty_roster_imports WHERE id = _import_id;
  IF v_eff_date IS NULL THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  FOR v_match IN
    SELECT DISTINCT ON (m.matched_profile_id)
      m.matched_profile_id, m.shift
    FROM public.pending_staff_matches m
    WHERE m.import_id = _import_id
      AND m.matched_profile_id IS NOT NULL
      AND m.shift IN ('A','B','C','D')
    ORDER BY m.matched_profile_id, m.created_at DESC
  LOOP
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE upper(name) = 'SHIFT ' || upper(v_match.shift)
    LIMIT 1;

    IF v_shift_id IS NULL THEN
      v_missing_shift := v_missing_shift + 1;
      CONTINUE;
    END IF;

    -- Skip if already on this shift with an open assignment starting on/before eff date
    IF EXISTS (
      SELECT 1 FROM public.shift_assignments sa
      WHERE sa.profile_id = v_match.matched_profile_id
        AND sa.shift_id = v_shift_id
        AND sa.start_date <= v_eff_date
        AND (sa.end_date IS NULL OR sa.end_date >= v_eff_date)
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Close any other open assignment(s) for this profile the day before
    UPDATE public.shift_assignments
       SET end_date = (v_eff_date - INTERVAL '1 day')::date
     WHERE profile_id = v_match.matched_profile_id
       AND (end_date IS NULL OR end_date >= v_eff_date);

    INSERT INTO public.shift_assignments (profile_id, shift_id, start_date)
    VALUES (v_match.matched_profile_id, v_shift_id, v_eff_date);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'assigned', v_assigned,
    'skipped_already_on_shift', v_skipped,
    'missing_shift_definition', v_missing_shift,
    'effective_date', v_eff_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_deploy_roster_assignments(uuid) TO authenticated;
