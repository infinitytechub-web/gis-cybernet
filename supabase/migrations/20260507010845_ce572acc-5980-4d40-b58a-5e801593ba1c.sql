-- 1. Excuse duty: expanded status workflow
ALTER TABLE public.excuse_duty_forms DROP CONSTRAINT IF EXISTS excuse_duty_forms_status_check;
UPDATE public.excuse_duty_forms SET status = 'submitted' WHERE status = 'pending';
ALTER TABLE public.excuse_duty_forms ALTER COLUMN status SET DEFAULT 'submitted';
ALTER TABLE public.excuse_duty_forms ADD CONSTRAINT excuse_duty_forms_status_check
  CHECK (status = ANY (ARRAY['submitted','reviewed','approved','rejected']));

-- Allow staff to insert with status submitted (replace prior 'pending' policy)
DROP POLICY IF EXISTS "Staff submit own excuse duty" ON public.excuse_duty_forms;
CREATE POLICY "Staff submit own excuse duty"
  ON public.excuse_duty_forms FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'submitted'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND review_comment IS NULL
    AND staff_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff update own pending excuse duty" ON public.excuse_duty_forms;
CREATE POLICY "Staff update own submitted excuse duty"
  ON public.excuse_duty_forms FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'submitted')
  WITH CHECK (submitted_by = auth.uid() AND status = 'submitted'
              AND reviewed_by IS NULL AND reviewed_at IS NULL);

-- Refresh the review enforcement trigger for new statuses
CREATE OR REPLACE FUNCTION public.enforce_excuse_duty_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _is_reviewer boolean;
BEGIN
  _is_reviewer := has_role(auth.uid(),'admin'::app_role)
               OR has_role(auth.uid(),'oic'::app_role)
               OR has_role(auth.uid(),'2ic'::app_role)
               OR has_role(auth.uid(),'head_of_administration'::app_role)
               OR has_role(auth.uid(),'chief_staff_officer'::app_role)
               OR has_role(auth.uid(),'staff_officer'::app_role)
               OR has_role(auth.uid(),'supervisor'::app_role)
               OR has_role(auth.uid(),'shift_supervisor'::app_role)
               OR has_role(auth.uid(),'deputy_shift_supervisor'::app_role);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('reviewed','approved','rejected') THEN
      IF NOT _is_reviewer THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only reviewers can change excuse duty status';
      END IF;
      IF NEW.submitted_by = auth.uid() THEN
        RAISE EXCEPTION 'SELF_REVIEW_BLOCKED: a submitter cannot review their own form';
      END IF;
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END$$;

-- 2. Notifications for excuse duty lifecycle
CREATE OR REPLACE FUNCTION public.notify_excuse_duty_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _staff_user uuid; _title text; _msg text; _type text;
        _reviewer uuid;
BEGIN
  SELECT user_id INTO _staff_user FROM profiles WHERE id = COALESCE(NEW.staff_profile_id, OLD.staff_profile_id);

  IF TG_OP = 'INSERT' THEN
    -- Notify reviewers of new submission
    _type := 'excuse_duty_submitted';
    _title := 'New Excuse Duty Form submitted';
    _msg := 'A new Excuse Duty Form is awaiting review.';
    FOR _reviewer IN
      SELECT DISTINCT ur.user_id FROM user_roles ur
      WHERE ur.role IN ('admin','oic','2ic','head_of_administration','chief_staff_officer','staff_officer','supervisor','shift_supervisor','deputy_shift_supervisor')
    LOOP
      IF _reviewer IS NOT NULL AND _reviewer <> NEW.submitted_by THEN
        INSERT INTO notifications(user_id, title, message, type, reference_id)
          VALUES (_reviewer, _title, _msg, _type, NEW.id);
      END IF;
    END LOOP;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _type := 'excuse_duty_' || NEW.status;
    _title := 'Excuse Duty Form ' || NEW.status;
    _msg := 'Your Excuse Duty Form has been ' || NEW.status
            || COALESCE(' — ' || NEW.review_comment, '');
    IF _staff_user IS NOT NULL THEN
      INSERT INTO notifications(user_id, title, message, type, reference_id)
        VALUES (_staff_user, _title, _msg, _type, NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS trg_notify_excuse_duty ON public.excuse_duty_forms;
CREATE TRIGGER trg_notify_excuse_duty
AFTER INSERT OR UPDATE ON public.excuse_duty_forms
FOR EACH ROW EXECUTE FUNCTION public.notify_excuse_duty_change();

-- 3. Role-checked, server-side audit EXPORT (full filtered set, no pagination)
CREATE OR REPLACE FUNCTION public.export_medical_inventory_audit(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_inventory_id uuid DEFAULT NULL,
  p_item_search text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_max_rows int DEFAULT 5000
)
RETURNS TABLE (
  id uuid, inventory_id uuid, action text, performed_by uuid,
  performed_at timestamptz, item_name text,
  delta int, quantity_before int, quantity_after int, note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  _allowed := has_role(_uid,'admin'::app_role)
           OR has_role(_uid,'oic'::app_role)
           OR has_role(_uid,'2ic'::app_role)
           OR has_role(_uid,'staff_officer'::app_role)
           OR has_role(_uid,'supervisor'::app_role)
           OR has_role(_uid,'head_of_administration'::app_role);
  IF NOT _allowed THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING HINT = 'Inventory audit export is restricted to Admin and Command tier.';
  END IF;

  RETURN QUERY
  SELECT a.id, a.inventory_id, a.action, a.performed_by, a.performed_at, a.item_name,
         a.delta, a.quantity_before, a.quantity_after, a.note
  FROM medical_inventory_audit a
  WHERE (p_from IS NULL OR a.performed_at >= p_from)
    AND (p_to IS NULL OR a.performed_at <= p_to)
    AND (p_performed_by IS NULL OR a.performed_by = p_performed_by)
    AND (p_inventory_id IS NULL OR a.inventory_id = p_inventory_id)
    AND (p_item_search IS NULL OR p_item_search = '' OR a.item_name ILIKE '%' || p_item_search || '%')
    AND (p_action IS NULL OR p_action = '' OR a.action = p_action)
  ORDER BY a.performed_at DESC, a.id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_max_rows, 5000), 20000));
END$$;

REVOKE ALL ON FUNCTION public.export_medical_inventory_audit(timestamptz, timestamptz, uuid, uuid, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_medical_inventory_audit(timestamptz, timestamptz, uuid, uuid, text, text, int) TO authenticated;