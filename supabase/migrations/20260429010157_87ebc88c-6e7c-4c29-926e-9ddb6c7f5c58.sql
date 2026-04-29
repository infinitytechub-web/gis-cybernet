-- Per-shift window overrides
CREATE TABLE IF NOT EXISTS public.shift_attendance_window_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL UNIQUE REFERENCES public.shifts(id) ON DELETE CASCADE,
  grace_minutes integer,
  early_checkin_minutes integer,
  late_checkout_minutes integer,
  enforce_window boolean,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_attendance_window_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read shift window overrides"
ON public.shift_attendance_window_overrides FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins manage shift window overrides"
ON public.shift_attendance_window_overrides FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_shift_window_overrides_updated_at
BEFORE UPDATE ON public.shift_attendance_window_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: resolve effective window for a given shift (override merged onto global settings)
CREATE OR REPLACE FUNCTION public.get_effective_attendance_window(_shift_id uuid)
RETURNS TABLE(
  grace_minutes integer,
  early_checkin_minutes integer,
  late_checkout_minutes integer,
  enforce_window boolean,
  source text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH g AS (
    SELECT grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window
    FROM public.attendance_window_settings
    ORDER BY created_at ASC
    LIMIT 1
  ), o AS (
    SELECT grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window
    FROM public.shift_attendance_window_overrides
    WHERE shift_id = _shift_id
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT grace_minutes FROM o), (SELECT grace_minutes FROM g), 15),
    COALESCE((SELECT early_checkin_minutes FROM o), (SELECT early_checkin_minutes FROM g), 30),
    COALESCE((SELECT late_checkout_minutes FROM o), (SELECT late_checkout_minutes FROM g), 60),
    COALESCE((SELECT enforce_window FROM o), (SELECT enforce_window FROM g), true),
    CASE WHEN EXISTS (SELECT 1 FROM o) THEN 'override' ELSE 'global' END;
$$;

-- Dedupe: before inserting an attendance_edit_request, if a pending request
-- already exists for the same profile/date/field, update it in place and skip insert
CREATE OR REPLACE FUNCTION public.dedupe_attendance_edit_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  -- Find a pending duplicate: same profile, same affected_date, and
  -- overlapping field (exact match OR either side is "both")
  SELECT id INTO _existing_id
  FROM public.attendance_edit_requests
  WHERE profile_id = NEW.profile_id
    AND affected_date = NEW.affected_date
    AND status = 'pending'
    AND (
      field = NEW.field
      OR field = 'both'
      OR NEW.field = 'both'
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.attendance_edit_requests
    SET
      attendance_id = COALESCE(NEW.attendance_id, attendance_id),
      field = CASE
        WHEN field = NEW.field THEN field
        ELSE 'both'
      END,
      proposed_check_in = COALESCE(NEW.proposed_check_in, proposed_check_in),
      proposed_check_out = COALESCE(NEW.proposed_check_out, proposed_check_out),
      current_check_in = COALESCE(NEW.current_check_in, current_check_in),
      current_check_out = COALESCE(NEW.current_check_out, current_check_out),
      reason = NEW.reason,
      requested_by = NEW.requested_by,
      updated_at = now()
    WHERE id = _existing_id;

    -- Skip the insert; signal to client by raising a notice
    RAISE NOTICE 'dedupe_attendance_edit_request: updated existing request %', _existing_id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aer_dedupe ON public.attendance_edit_requests;
CREATE TRIGGER trg_aer_dedupe
BEFORE INSERT ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.dedupe_attendance_edit_request();