-- =============================================================
-- Approval audit trail for leave/pass requests, postings, and transfers
-- =============================================================

-- 1. Table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_approval_audit (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('leave_request','posting_transfer')),
  entity_id       UUID NOT NULL,
  request_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id   UUID,                       -- auth.users.id of the actor (no FK to auth schema)
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role      TEXT,                       -- snapshot of acting role at the time
  action          TEXT NOT NULL CHECK (action IN ('approved','rejected','edited','reverted_to_pending','cancelled')),
  previous_status TEXT,
  new_status      TEXT,
  changed_fields  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { field: { old, new } }
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_audit_entity      ON public.request_approval_audit (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_audit_actor       ON public.request_approval_audit (actor_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_audit_request_profile ON public.request_approval_audit (request_profile_id, created_at DESC);

-- 2. RLS -------------------------------------------------------
ALTER TABLE public.request_approval_audit ENABLE ROW LEVEL SECURITY;

-- Read access: command tier + the supervisor of the affected staff member's department.
-- Staff themselves do NOT see the audit log — they only see the public status on the request.
DROP POLICY IF EXISTS "Command tier can view approval audit" ON public.request_approval_audit;
CREATE POLICY "Command tier can view approval audit"
ON public.request_approval_audit
FOR SELECT
TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR public.is_supervisor_for_profile(auth.uid(), request_profile_id)
);

-- No INSERT/UPDATE/DELETE policies are defined: writes happen only from a
-- SECURITY DEFINER trigger, which bypasses RLS. This guarantees the audit
-- log cannot be tampered with from client code.

-- 3. Trigger function -----------------------------------------
CREATE OR REPLACE FUNCTION public.log_request_approval_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type    TEXT;
  v_request_profile UUID;
  v_actor_user     UUID := auth.uid();
  v_actor_profile  UUID;
  v_actor_role     TEXT;
  v_action         TEXT;
  v_old_status     TEXT;
  v_new_status     TEXT;
  v_changed        JSONB := '{}'::jsonb;
  v_notes          TEXT;
BEGIN
  -- Determine entity type from trigger argument
  v_entity_type := TG_ARGV[0];

  -- Skip if no acting user (system-level updates) — keeps the log meaningful
  IF v_actor_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_old_status := OLD.status::TEXT;
  v_new_status := NEW.status::TEXT;

  -- Resolve actor profile and highest role
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

  -- Decide action and capture diffs
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    v_action := CASE v_new_status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'pending'  THEN 'reverted_to_pending'
      ELSE 'edited'
    END;
    v_changed := jsonb_build_object('status', jsonb_build_object('old', v_old_status, 'new', v_new_status));
  ELSE
    v_action := 'edited';
  END IF;

  -- Capture comments/remarks change
  IF v_entity_type = 'leave_request' THEN
    v_request_profile := NEW.profile_id;
    v_notes := NEW.comments;
    IF OLD.comments IS DISTINCT FROM NEW.comments THEN
      v_changed := v_changed || jsonb_build_object('comments', jsonb_build_object('old', OLD.comments, 'new', NEW.comments));
    END IF;
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
      v_changed := v_changed || jsonb_build_object('start_date', jsonb_build_object('old', OLD.start_date, 'new', NEW.start_date));
    END IF;
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      v_changed := v_changed || jsonb_build_object('end_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date));
    END IF;
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      v_changed := v_changed || jsonb_build_object('type', jsonb_build_object('old', OLD.type::TEXT, 'new', NEW.type::TEXT));
    END IF;
  ELSIF v_entity_type = 'posting_transfer' THEN
    v_request_profile := NEW.profile_id;
    v_notes := NEW.remarks;
    IF OLD.remarks IS DISTINCT FROM NEW.remarks THEN
      v_changed := v_changed || jsonb_build_object('remarks', jsonb_build_object('old', OLD.remarks, 'new', NEW.remarks));
    END IF;
    IF OLD.effective_date IS DISTINCT FROM NEW.effective_date THEN
      v_changed := v_changed || jsonb_build_object('effective_date', jsonb_build_object('old', OLD.effective_date, 'new', NEW.effective_date));
    END IF;
    IF OLD.from_department_id IS DISTINCT FROM NEW.from_department_id THEN
      v_changed := v_changed || jsonb_build_object('from_department_id', jsonb_build_object('old', OLD.from_department_id, 'new', NEW.from_department_id));
    END IF;
    IF OLD.to_department_id IS DISTINCT FROM NEW.to_department_id THEN
      v_changed := v_changed || jsonb_build_object('to_department_id', jsonb_build_object('old', OLD.to_department_id, 'new', NEW.to_department_id));
    END IF;
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      v_changed := v_changed || jsonb_build_object('type', jsonb_build_object('old', OLD.type::TEXT, 'new', NEW.type::TEXT));
    END IF;
  END IF;

  -- Skip noise: an UPDATE that touched nothing meaningful
  IF v_action = 'edited' AND v_changed = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.request_approval_audit (
    entity_type, entity_id, request_profile_id,
    actor_user_id, actor_profile_id, actor_role,
    action, previous_status, new_status, changed_fields, notes
  ) VALUES (
    v_entity_type, NEW.id, v_request_profile,
    v_actor_user, v_actor_profile, v_actor_role,
    v_action, v_old_status, v_new_status, v_changed, v_notes
  );

  RETURN NEW;
END;
$$;

-- 4. Triggers --------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_audit_leave_requests
AFTER UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_request_approval_change('leave_request');

DROP TRIGGER IF EXISTS trg_audit_postings_transfers ON public.postings_transfers;
CREATE TRIGGER trg_audit_postings_transfers
AFTER UPDATE ON public.postings_transfers
FOR EACH ROW
EXECUTE FUNCTION public.log_request_approval_change('posting_transfer');