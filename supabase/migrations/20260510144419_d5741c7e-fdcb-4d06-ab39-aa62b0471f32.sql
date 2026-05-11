
CREATE OR REPLACE FUNCTION public.override_shift_assignment(
  _profile_id uuid,
  _shift_letter text,
  _start_date date,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_id uuid;
  v_prev_shift text;
  v_prev_shift_id uuid;
  v_new_assignment uuid;
BEGIN
  IF NOT public.is_roster_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _profile_id IS NULL OR _shift_letter IS NULL OR _start_date IS NULL THEN
    RAISE EXCEPTION 'profile, shift letter and start date are required';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  IF upper(_shift_letter) NOT IN ('A','B','C','D') THEN
    RAISE EXCEPTION 'Shift letter must be A, B, C or D';
  END IF;

  SELECT id INTO v_shift_id
    FROM public.shifts
   WHERE upper(name) = 'SHIFT ' || upper(_shift_letter)
   LIMIT 1;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Shift % is not configured', _shift_letter;
  END IF;

  -- Snapshot current open assignment for audit
  SELECT s.name, sa.shift_id INTO v_prev_shift, v_prev_shift_id
    FROM public.shift_assignments sa
    JOIN public.shifts s ON s.id = sa.shift_id
   WHERE sa.profile_id = _profile_id
     AND (sa.end_date IS NULL OR sa.end_date >= _start_date)
   ORDER BY sa.start_date DESC
   LIMIT 1;

  IF v_prev_shift_id = v_shift_id THEN
    RETURN jsonb_build_object('changed', false, 'message', 'Staff already on this shift');
  END IF;

  -- Close any open assignments the day before
  UPDATE public.shift_assignments
     SET end_date = (_start_date - INTERVAL '1 day')::date
   WHERE profile_id = _profile_id
     AND (end_date IS NULL OR end_date >= _start_date);

  INSERT INTO public.shift_assignments (profile_id, shift_id, start_date)
  VALUES (_profile_id, v_shift_id, _start_date)
  RETURNING id INTO v_new_assignment;

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES (
    'override',
    'shift_assignment',
    v_new_assignment,
    auth.uid(),
    jsonb_build_object(
      'profile_id', _profile_id,
      'previous_shift', COALESCE(v_prev_shift, 'none'),
      'new_shift', 'Shift ' || upper(_shift_letter),
      'effective_date', _start_date,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'changed', true,
    'previous_shift', COALESCE(v_prev_shift, 'none'),
    'new_shift', 'Shift ' || upper(_shift_letter),
    'assignment_id', v_new_assignment
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.override_shift_assignment(uuid, text, date, text) TO authenticated;
