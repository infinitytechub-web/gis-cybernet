ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- Stamp deciding officer + timestamp automatically
CREATE OR REPLACE FUNCTION public.set_leave_decision_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved','rejected') THEN
      SELECT id INTO v_actor_profile FROM public.profiles WHERE user_id = auth.uid();
      NEW.decided_at := now();
      IF v_actor_profile IS NOT NULL THEN
        NEW.approved_by := v_actor_profile;
      END IF;
    ELSIF NEW.status = 'pending' THEN
      NEW.decided_at := NULL;
      NEW.approved_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_leave_decision_metadata ON public.leave_requests;
CREATE TRIGGER trg_set_leave_decision_metadata
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.set_leave_decision_metadata();

-- Allow command-tier edits while the request is still pending
CREATE OR REPLACE FUNCTION public.restrict_leave_request_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Command tier may correct request details while it is still pending
  IF OLD.status = 'pending' AND public.is_command_tier(auth.uid()) THEN
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      RAISE EXCEPTION 'Cannot change profile_id';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'Cannot change profile_id';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Cannot change leave type';
  END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION 'Cannot change start_date';
  END IF;
  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    RAISE EXCEPTION 'Cannot change end_date';
  END IF;
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'Cannot change reason';
  END IF;
  RETURN NEW;
END;
$$;

-- Approval audit trail for leave requests
DROP TRIGGER IF EXISTS trg_log_leave_approval_change ON public.leave_requests;
CREATE TRIGGER trg_log_leave_approval_change
AFTER UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.log_request_approval_change('leave_request');

-- Log deletions (soft delete removes the row after snapshotting it)
CREATE OR REPLACE FUNCTION public.log_leave_request_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user UUID := auth.uid();
  v_actor_profile UUID;
  v_actor_role TEXT;
BEGIN
  IF v_actor_user IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id INTO v_actor_profile FROM public.profiles WHERE user_id = v_actor_user;

  SELECT ur.role::TEXT INTO v_actor_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_actor_user
  ORDER BY CASE ur.role::TEXT
    WHEN 'admin' THEN 0
    WHEN 'oic' THEN 1
    WHEN '2ic' THEN 2
    WHEN 'staff_officer' THEN 3
    WHEN 'supervisor' THEN 4
    ELSE 99
  END
  LIMIT 1;

  INSERT INTO public.request_approval_audit (
    entity_type, entity_id, request_profile_id,
    actor_user_id, actor_profile_id, actor_role,
    action, previous_status, new_status, changed_fields, notes
  ) VALUES (
    'leave_request', OLD.id, OLD.profile_id,
    v_actor_user, v_actor_profile, v_actor_role,
    'deleted', OLD.status::TEXT, NULL,
    jsonb_build_object(
      'type', jsonb_build_object('old', OLD.type::TEXT, 'new', NULL),
      'start_date', jsonb_build_object('old', OLD.start_date, 'new', NULL),
      'end_date', jsonb_build_object('old', OLD.end_date, 'new', NULL)
    ),
    OLD.comments
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_leave_request_deletion ON public.leave_requests;
CREATE TRIGGER trg_log_leave_request_deletion
AFTER DELETE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.log_leave_request_deletion();