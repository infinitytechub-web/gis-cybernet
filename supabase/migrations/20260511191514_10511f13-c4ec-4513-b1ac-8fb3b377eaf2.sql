ALTER TABLE public.duty_roster_imports
  ADD COLUMN IF NOT EXISTS effective_end_date date;

CREATE TABLE IF NOT EXISTS public.shift_assignment_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  new_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('assign','reassign','remove')),
  effective_date date NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'admin_override',
  import_id uuid REFERENCES public.duty_roster_imports(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sao_profile ON public.shift_assignment_overrides(profile_id);
CREATE INDEX IF NOT EXISTS idx_sao_import ON public.shift_assignment_overrides(import_id);
CREATE INDEX IF NOT EXISTS idx_sao_created ON public.shift_assignment_overrides(created_at DESC);

ALTER TABLE public.shift_assignment_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roster managers manage overrides" ON public.shift_assignment_overrides;
CREATE POLICY "Roster managers manage overrides"
  ON public.shift_assignment_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_roster_manager(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_roster_manager(auth.uid()));

DROP POLICY IF EXISTS "Staff view own overrides" ON public.shift_assignment_overrides;
CREATE POLICY "Staff view own overrides"
  ON public.shift_assignment_overrides
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.block_sao_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'shift_assignment_overrides is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_sao_no_update ON public.shift_assignment_overrides;
CREATE TRIGGER trg_sao_no_update BEFORE UPDATE OR DELETE ON public.shift_assignment_overrides
FOR EACH ROW EXECUTE FUNCTION public.block_sao_mutations();

DROP FUNCTION IF EXISTS public.override_shift_assignment(uuid,text,date,text);
CREATE OR REPLACE FUNCTION public.override_shift_assignment(
  _profile_id uuid,
  _new_shift_code text,
  _effective_date date,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_shift uuid;
  v_prev_shift uuid;
  v_perf uuid;
  v_action text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_roster_manager(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT id INTO v_perf FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF _new_shift_code IS NULL OR upper(_new_shift_code) IN ('REMOVE','NONE','') THEN
    v_new_shift := NULL;
    v_action := 'remove';
  ELSE
    SELECT id INTO v_new_shift FROM public.shifts
     WHERE upper(name) = 'SHIFT ' || upper(_new_shift_code) LIMIT 1;
    IF v_new_shift IS NULL THEN
      RAISE EXCEPTION 'Unknown shift code %', _new_shift_code;
    END IF;
    v_action := 'reassign';
  END IF;

  SELECT shift_id INTO v_prev_shift FROM public.shift_assignments
   WHERE profile_id = _profile_id
     AND start_date <= _effective_date
     AND (end_date IS NULL OR end_date >= _effective_date)
   ORDER BY start_date DESC LIMIT 1;

  IF v_prev_shift IS NULL AND v_new_shift IS NOT NULL THEN
    v_action := 'assign';
  END IF;

  IF v_prev_shift IS NOT NULL AND v_new_shift = v_prev_shift THEN
    RETURN jsonb_build_object('action','noop','reason','Already on requested shift');
  END IF;

  UPDATE public.shift_assignments
     SET end_date = (_effective_date - INTERVAL '1 day')::date
   WHERE profile_id = _profile_id
     AND (end_date IS NULL OR end_date >= _effective_date);

  IF v_new_shift IS NOT NULL THEN
    INSERT INTO public.shift_assignments (profile_id, shift_id, start_date)
    VALUES (_profile_id, v_new_shift, _effective_date);
  END IF;

  INSERT INTO public.shift_assignment_overrides
    (profile_id, previous_shift_id, new_shift_id, action, effective_date, reason, source, performed_by)
  VALUES
    (_profile_id, v_prev_shift, v_new_shift, v_action, _effective_date, _reason, 'admin_override', v_perf);

  RETURN jsonb_build_object(
    'action', v_action,
    'previous_shift_id', v_prev_shift,
    'new_shift_id', v_new_shift
  );
END $$;

GRANT EXECUTE ON FUNCTION public.override_shift_assignment(uuid,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_deploy_roster_assignments(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eff_date date;
  v_end_date date;
  v_match record;
  v_shift_id uuid;
  v_prev uuid;
  v_assigned int := 0;
  v_skipped int := 0;
  v_missing_shift int := 0;
  v_perf uuid;
BEGIN
  IF NOT public.is_roster_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT id INTO v_perf FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  SELECT effective_date, effective_end_date INTO v_eff_date, v_end_date
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
    SELECT id INTO v_shift_id FROM public.shifts
     WHERE upper(name) = 'SHIFT ' || upper(v_match.shift) LIMIT 1;
    IF v_shift_id IS NULL THEN
      v_missing_shift := v_missing_shift + 1; CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.shift_assignments sa
      WHERE sa.profile_id = v_match.matched_profile_id
        AND sa.shift_id = v_shift_id
        AND sa.start_date <= v_eff_date
        AND (sa.end_date IS NULL OR sa.end_date >= v_eff_date)
    ) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    SELECT shift_id INTO v_prev FROM public.shift_assignments
     WHERE profile_id = v_match.matched_profile_id
       AND start_date <= v_eff_date AND (end_date IS NULL OR end_date >= v_eff_date)
     ORDER BY start_date DESC LIMIT 1;

    UPDATE public.shift_assignments
       SET end_date = (v_eff_date - INTERVAL '1 day')::date
     WHERE profile_id = v_match.matched_profile_id
       AND (end_date IS NULL OR end_date >= v_eff_date);

    INSERT INTO public.shift_assignments (profile_id, shift_id, start_date, end_date)
    VALUES (v_match.matched_profile_id, v_shift_id, v_eff_date, v_end_date);

    INSERT INTO public.shift_assignment_overrides
      (profile_id, previous_shift_id, new_shift_id, action, effective_date, reason, source, import_id, performed_by)
    VALUES
      (v_match.matched_profile_id, v_prev, v_shift_id,
       CASE WHEN v_prev IS NULL THEN 'assign' ELSE 'reassign' END,
       v_eff_date, 'Auto-deployed from roster import', 'auto_deploy', _import_id, v_perf);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'assigned', v_assigned,
    'skipped_already_on_shift', v_skipped,
    'missing_shift_definition', v_missing_shift,
    'effective_date', v_eff_date,
    'effective_end_date', v_end_date
  );
END $$;

GRANT EXECUTE ON FUNCTION public.auto_deploy_roster_assignments(uuid) TO authenticated;