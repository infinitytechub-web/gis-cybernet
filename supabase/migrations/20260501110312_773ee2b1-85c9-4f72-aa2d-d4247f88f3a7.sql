-- Pending staff matches (auto-created from roster import)
CREATE TABLE public.pending_staff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.duty_roster_imports(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.duty_roster_entries(id) ON DELETE CASCADE,
  rank_text text NOT NULL,
  name_text text NOT NULL,
  serial_no integer NOT NULL,
  shift text NOT NULL,
  gender text,
  unit text,
  matched_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','merged','rejected')),
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_psm_status ON public.pending_staff_matches(status);
CREATE INDEX idx_psm_import ON public.pending_staff_matches(import_id);

ALTER TABLE public.pending_staff_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier read pending matches" ON public.pending_staff_matches
  FOR SELECT USING (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier insert pending matches" ON public.pending_staff_matches
  FOR INSERT WITH CHECK (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier update pending matches" ON public.pending_staff_matches
  FOR UPDATE USING (public.is_roster_manager(auth.uid()));
CREATE POLICY "Command tier delete pending matches" ON public.pending_staff_matches
  FOR DELETE USING (public.is_roster_manager(auth.uid()));

-- Guard schedules
CREATE TABLE public.guard_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  source_import_id uuid REFERENCES public.duty_roster_imports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guard_schedules_dates ON public.guard_schedules(start_date, end_date);

ALTER TABLE public.guard_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier manage schedules" ON public.guard_schedules
  FOR ALL USING (public.is_roster_manager(auth.uid()))
  WITH CHECK (public.is_roster_manager(auth.uid()));

CREATE POLICY "Authenticated read published schedules" ON public.guard_schedules
  FOR SELECT TO authenticated USING (status = 'published');

CREATE TRIGGER trg_guard_schedules_updated
  BEFORE UPDATE ON public.guard_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guard schedule assignments (one row per date+shift+person)
CREATE TABLE public.guard_schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.guard_schedules(id) ON DELETE CASCADE,
  duty_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('A','B','C','D')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rank_text text,
  name_text text NOT NULL,
  serial_no integer,
  unit text,
  position_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gsa_schedule ON public.guard_schedule_assignments(schedule_id);
CREATE INDEX idx_gsa_date_shift ON public.guard_schedule_assignments(duty_date, shift);
CREATE INDEX idx_gsa_profile ON public.guard_schedule_assignments(profile_id);

ALTER TABLE public.guard_schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier manage assignments" ON public.guard_schedule_assignments
  FOR ALL USING (public.is_roster_manager(auth.uid()))
  WITH CHECK (public.is_roster_manager(auth.uid()));

CREATE POLICY "Authenticated read assignments of published" ON public.guard_schedule_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.guard_schedules s WHERE s.id = schedule_id AND s.status = 'published')
  );

-- Auto-match function: called after a roster import is committed.
-- Tries to match each entry to an existing profile by (last_name + first initial)
-- and serial_no fuzzy. Unmatched → pending_staff_matches with auto-created stub profile.
CREATE OR REPLACE FUNCTION public.auto_match_roster_entries(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_profile_id uuid;
  v_dept_id uuid;
  v_rank_id uuid;
  v_first text;
  v_last text;
  v_parts text[];
  v_matched int := 0;
  v_pending int := 0;
  v_created int := 0;
  v_staff_id text;
BEGIN
  IF NOT public.is_roster_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR v_entry IN
    SELECT * FROM public.duty_roster_entries WHERE import_id = _import_id
  LOOP
    -- Split name "LAST FIRST OTHER" or "FIRST LAST"
    v_parts := regexp_split_to_array(trim(v_entry.name), '\s+');
    IF array_length(v_parts, 1) >= 2 THEN
      v_last := v_parts[1];
      v_first := v_parts[2];
    ELSE
      v_last := COALESCE(v_parts[1], v_entry.name);
      v_first := '';
    END IF;

    -- Try to match by case-insensitive last+first prefix
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE upper(last_name) = upper(v_last)
      AND (v_first = '' OR upper(first_name) LIKE upper(v_first) || '%')
    ORDER BY (CASE WHEN shift_group = v_entry.shift THEN 0 ELSE 1 END)
    LIMIT 1;

    -- Fallback: try reversed (first/last swapped)
    IF v_profile_id IS NULL AND v_first <> '' THEN
      SELECT id INTO v_profile_id
      FROM public.profiles
      WHERE upper(first_name) = upper(v_last)
        AND upper(last_name) LIKE upper(v_first) || '%'
      LIMIT 1;
    END IF;

    IF v_profile_id IS NOT NULL THEN
      -- Update existing: shift_group + unit (only if empty/different)
      UPDATE public.profiles
      SET shift_group = v_entry.shift,
          unit = COALESCE(NULLIF(v_entry.unit, ''), unit),
          gender = COALESCE(NULLIF(v_entry.gender, ''), gender),
          updated_at = now()
      WHERE id = v_profile_id;

      INSERT INTO public.pending_staff_matches
        (import_id, entry_id, rank_text, name_text, serial_no, shift, gender, unit, matched_profile_id, status, resolved_at)
      VALUES
        (_import_id, v_entry.id, v_entry.rank, v_entry.name, v_entry.serial_no, v_entry.shift,
         v_entry.gender, v_entry.unit, v_profile_id, 'merged', now());
      v_matched := v_matched + 1;
    ELSE
      -- Auto-create pending stub profile (no auth user yet, login disabled)
      v_staff_id := 'PEND-' || lpad((floor(random()*100000))::text, 5, '0') || '-' || v_entry.serial_no;

      -- Try to map rank text → rank_id
      SELECT id INTO v_rank_id FROM public.ranks WHERE upper(name) = upper(v_entry.rank) LIMIT 1;

      INSERT INTO public.profiles (staff_id, first_name, last_name, rank_id, gender, unit, shift_group, status, login_enabled)
      VALUES (v_staff_id,
              COALESCE(NULLIF(v_first, ''), v_entry.name),
              v_last,
              v_rank_id,
              NULLIF(v_entry.gender, ''),
              NULLIF(v_entry.unit, ''),
              v_entry.shift,
              'active'::staff_status,
              false)
      RETURNING id INTO v_profile_id;

      INSERT INTO public.pending_staff_matches
        (import_id, entry_id, rank_text, name_text, serial_no, shift, gender, unit, created_profile_id, status)
      VALUES
        (_import_id, v_entry.id, v_entry.rank, v_entry.name, v_entry.serial_no, v_entry.shift,
         v_entry.gender, v_entry.unit, v_profile_id, 'pending');
      v_pending := v_pending + 1;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  -- Audit
  INSERT INTO public.security_audit_log (category, action, severity, actor_id, details)
  VALUES ('account', 'roster_auto_match', 'info', auth.uid(),
          jsonb_build_object('import_id', _import_id, 'matched', v_matched, 'pending', v_pending, 'created_profiles', v_created));

  RETURN jsonb_build_object('matched', v_matched, 'pending', v_pending, 'created_profiles', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_match_roster_entries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_match_roster_entries(uuid) TO authenticated;