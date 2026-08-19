CREATE OR REPLACE FUNCTION public.roster_clock_action(
  _profile_id uuid,
  _action text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Effective shift window for today (if the officer is assigned to one).
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
      INSERT INTO public.attendances (profile_id, date, check_in, status, notes)
      VALUES (_profile_id, v_today, v_now, v_status, NULLIF(_notes, ''))
      RETURNING * INTO v_rec;
    ELSE
      UPDATE public.attendances
         SET check_in = v_now,
             status = v_status,
             notes = COALESCE(NULLIF(_notes, ''), notes),
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
$$;

REVOKE ALL ON FUNCTION public.roster_clock_action(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roster_clock_action(uuid, text, text) TO authenticated;