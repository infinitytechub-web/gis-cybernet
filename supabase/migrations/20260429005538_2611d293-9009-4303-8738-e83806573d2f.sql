-- Configurable attendance window/grace settings (single row)
CREATE TABLE IF NOT EXISTS public.attendance_window_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grace_minutes integer NOT NULL DEFAULT 15,
  early_checkin_minutes integer NOT NULL DEFAULT 30,
  late_checkout_minutes integer NOT NULL DEFAULT 60,
  enforce_window boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.attendance_window_settings (grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window)
SELECT 15, 30, 60, true
WHERE NOT EXISTS (SELECT 1 FROM public.attendance_window_settings);

ALTER TABLE public.attendance_window_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authed can read attendance window settings"
ON public.attendance_window_settings FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins can manage attendance window settings"
ON public.attendance_window_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_attendance_window_settings_updated_at
BEFORE UPDATE ON public.attendance_window_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attendance edit requests
CREATE TABLE IF NOT EXISTS public.attendance_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.attendances(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  affected_date date NOT NULL,
  field text NOT NULL CHECK (field IN ('check_in','check_out','both')),
  current_check_in timestamptz,
  current_check_out timestamptz,
  proposed_check_in timestamptz,
  proposed_check_out timestamptz,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aer_profile ON public.attendance_edit_requests(profile_id);
CREATE INDEX idx_aer_status ON public.attendance_edit_requests(status);
CREATE INDEX idx_aer_date ON public.attendance_edit_requests(affected_date);

ALTER TABLE public.attendance_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view their own attendance edit requests"
ON public.attendance_edit_requests FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'oic')
  OR public.has_role(auth.uid(),'2ic')
  OR public.has_role(auth.uid(),'staff_officer')
  OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'shift_supervisor')
  OR public.has_role(auth.uid(),'deputy_shift_supervisor')
);

CREATE POLICY "Staff create their own attendance edit requests"
ON public.attendance_edit_requests FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Staff cancel or supervisors review attendance edit requests"
ON public.attendance_edit_requests FOR UPDATE
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'oic')
  OR public.has_role(auth.uid(),'2ic')
  OR public.has_role(auth.uid(),'staff_officer')
  OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'shift_supervisor')
  OR public.has_role(auth.uid(),'deputy_shift_supervisor')
)
WITH CHECK (
  requested_by = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'oic')
  OR public.has_role(auth.uid(),'2ic')
  OR public.has_role(auth.uid(),'staff_officer')
  OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'shift_supervisor')
  OR public.has_role(auth.uid(),'deputy_shift_supervisor')
);

CREATE TRIGGER trg_aer_updated_at
BEFORE UPDATE ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Restrict updates: requester can only cancel; reviewers stamp + apply changes
CREATE OR REPLACE FUNCTION public.handle_attendance_edit_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_command boolean;
BEGIN
  _is_command :=
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'oic') OR
    public.has_role(auth.uid(),'2ic') OR
    public.has_role(auth.uid(),'staff_officer') OR
    public.has_role(auth.uid(),'supervisor') OR
    public.has_role(auth.uid(),'shift_supervisor') OR
    public.has_role(auth.uid(),'deputy_shift_supervisor');

  IF auth.uid() = OLD.requested_by AND NOT _is_command THEN
    IF NEW.status <> OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You may only cancel your own request';
    END IF;
    NEW.profile_id := OLD.profile_id;
    NEW.attendance_id := OLD.attendance_id;
    NEW.affected_date := OLD.affected_date;
    NEW.field := OLD.field;
    NEW.proposed_check_in := OLD.proposed_check_in;
    NEW.proposed_check_out := OLD.proposed_check_out;
    NEW.reason := OLD.reason;
  END IF;

  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    IF NEW.status = 'rejected' AND (NEW.review_comment IS NULL OR length(trim(NEW.review_comment))=0) THEN
      RAISE EXCEPTION 'A review comment is required when rejecting a request';
    END IF;

    -- Apply to attendances on approval
    IF NEW.status = 'approved' AND NEW.attendance_id IS NOT NULL THEN
      UPDATE public.attendances
      SET
        check_in = CASE WHEN NEW.field IN ('check_in','both') AND NEW.proposed_check_in IS NOT NULL
                        THEN NEW.proposed_check_in ELSE check_in END,
        check_out = CASE WHEN NEW.field IN ('check_out','both') AND NEW.proposed_check_out IS NOT NULL
                         THEN NEW.proposed_check_out ELSE check_out END
      WHERE id = NEW.attendance_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aer_handle_update
BEFORE UPDATE ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_attendance_edit_request_update();

-- Notifications
CREATE OR REPLACE FUNCTION public.notify_new_attendance_edit_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
BEGIN
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _name FROM public.profiles WHERE id = NEW.profile_id LIMIT 1;
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic','staff_officer','supervisor','shift_supervisor','deputy_shift_supervisor']::app_role[],
    'New Attendance Edit Request',
    format('%s requested an edit to %s for %s.', COALESCE(NULLIF(_name,''),'A staff member'), NEW.field, to_char(NEW.affected_date,'DD Mon YYYY')),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aer_notify_new
AFTER INSERT ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_new_attendance_edit_request();

CREATE OR REPLACE FUNCTION public.notify_attendance_edit_request_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_id)
    VALUES (
      NEW.requested_by,
      format('Attendance Edit %s', initcap(NEW.status)),
      format('Your edit request for %s (%s) was %s%s.',
        to_char(NEW.affected_date,'DD Mon YYYY'),
        NEW.field,
        NEW.status,
        CASE WHEN NEW.review_comment IS NOT NULL AND length(trim(NEW.review_comment))>0
             THEN ' — ' || NEW.review_comment ELSE '' END
      ),
      'general',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aer_notify_review
AFTER UPDATE ON public.attendance_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_attendance_edit_request_review();