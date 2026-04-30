-- Snapshots table for safe rollback of destructive bulk uploads
CREATE TABLE IF NOT EXISTS public.staff_bulk_upload_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_by UUID,
  taken_by_name TEXT,
  file_name TEXT,
  note TEXT,
  profiles_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  night_guard_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  profiles_count INT NOT NULL DEFAULT 0,
  night_guard_count INT NOT NULL DEFAULT 0,
  restored_at TIMESTAMPTZ,
  restored_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_bulk_upload_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can view snapshots"
  ON public.staff_bulk_upload_snapshots FOR SELECT
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
    OR has_role(auth.uid(),'chief_staff_officer'::app_role)
  );

CREATE POLICY "Command tier can insert snapshots"
  ON public.staff_bulk_upload_snapshots FOR INSERT
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
    OR has_role(auth.uid(),'chief_staff_officer'::app_role)
  );

-- No UPDATE/DELETE policies => immutable

CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON public.staff_bulk_upload_snapshots(created_at DESC);

-- Restore function (security definer to bypass restrict_profile_updates trigger safely)
CREATE OR REPLACE FUNCTION public.restore_staff_bulk_snapshot(p_snapshot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_snap RECORD;
  v_profiles_restored INT := 0;
  v_ng_restored INT := 0;
  v_row JSONB;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    has_role(v_user,'admin'::app_role)
    OR has_role(v_user,'oic'::app_role)
    OR has_role(v_user,'2ic'::app_role)
    OR has_role(v_user,'chief_staff_officer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden — command tier only';
  END IF;

  SELECT * INTO v_snap FROM public.staff_bulk_upload_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found';
  END IF;

  -- Restore Night Guard assignments first (FK depends on profiles)
  DELETE FROM public.shift_assignments
   WHERE shift_id IN (SELECT id FROM public.shifts WHERE lower(name) LIKE '%night guard%');

  FOR v_row IN SELECT jsonb_array_elements(v_snap.night_guard_data)
  LOOP
    INSERT INTO public.shift_assignments (id, profile_id, shift_id, start_date, end_date, created_at)
    VALUES (
      COALESCE((v_row->>'id')::UUID, gen_random_uuid()),
      (v_row->>'profile_id')::UUID,
      (v_row->>'shift_id')::UUID,
      (v_row->>'start_date')::DATE,
      (v_row->>'end_date')::DATE,
      COALESCE((v_row->>'created_at')::TIMESTAMPTZ, now())
    )
    ON CONFLICT (id) DO NOTHING;
    v_ng_restored := v_ng_restored + 1;
  END LOOP;

  -- Restore profiles by upsert (do NOT delete to preserve FK chains; reset status of those in snapshot)
  FOR v_row IN SELECT jsonb_array_elements(v_snap.profiles_data)
  LOOP
    UPDATE public.profiles SET
      first_name = COALESCE(v_row->>'first_name', first_name),
      last_name  = COALESCE(v_row->>'last_name', last_name),
      rank_id    = NULLIF(v_row->>'rank_id','')::UUID,
      department_id = NULLIF(v_row->>'department_id','')::UUID,
      phone      = v_row->>'phone',
      gender     = v_row->>'gender',
      status     = COALESCE((v_row->>'status')::staff_status, status),
      unit       = v_row->>'unit',
      shift_group = v_row->>'shift_group',
      ghana_card_number = v_row->>'ghana_card_number',
      email      = v_row->>'email',
      blood_group = v_row->>'blood_group',
      intake     = NULLIF(v_row->>'intake','')::INT,
      training_designation = v_row->>'training_designation',
      staff_category = v_row->>'staff_category',
      office     = v_row->>'office'
    WHERE staff_id = v_row->>'staff_id';
    IF FOUND THEN
      v_profiles_restored := v_profiles_restored + 1;
    END IF;
  END LOOP;

  UPDATE public.staff_bulk_upload_snapshots
     SET restored_at = now(), restored_by = v_user
   WHERE id = p_snapshot_id;

  RETURN jsonb_build_object(
    'profiles_restored', v_profiles_restored,
    'night_guard_restored', v_ng_restored
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_staff_bulk_snapshot(UUID) TO authenticated;