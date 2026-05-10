-- =========================================
-- 1. Conflict-detection trigger
-- =========================================
CREATE OR REPLACE FUNCTION public.check_rotation_proposal_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text;
  v_target_group text;
  v_date_from date;
  v_date_to date;
  v_conflict record;
BEGIN
  -- Only check when proposal is being created or moved to/within active states
  IF NEW.status NOT IN ('pending','approved') THEN
    RETURN NEW;
  END IF;

  v_scope := COALESCE(NEW.pattern->>'scope', 'unit_wide');

  IF v_scope = 'reassignment' THEN
    v_target_group := COALESCE(NEW.pattern->>'target_group', 'ALL');
    v_date_from := COALESCE((NEW.pattern->>'date_from')::date, NEW.effective_from);
    v_date_to := COALESCE((NEW.pattern->>'date_to')::date, NEW.effective_from);

    SELECT id, title, pattern->>'target_group' AS tg,
           pattern->>'date_from' AS df, pattern->>'date_to' AS dt
      INTO v_conflict
      FROM public.rotation_change_proposals
     WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND status IN ('pending','approved','applied')
       AND COALESCE(pattern->>'scope','unit_wide') = 'reassignment'
       AND (
            pattern->>'target_group' = v_target_group
         OR pattern->>'target_group' = 'ALL'
         OR v_target_group = 'ALL'
       )
       AND daterange(
             COALESCE((pattern->>'date_from')::date, effective_from),
             COALESCE((pattern->>'date_to')::date, effective_from),
             '[]'
           ) && daterange(v_date_from, v_date_to, '[]')
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Rotation reassignment conflicts with proposal "%" (group %, % to %). Withdraw or wait for that decision before submitting.',
        v_conflict.title, v_conflict.tg, v_conflict.df, v_conflict.dt
        USING ERRCODE = 'check_violation';
    END IF;

  ELSE
    -- Unit-wide cycle proposals: block if another active cycle exists within 30 days
    SELECT id, title, effective_from
      INTO v_conflict
      FROM public.rotation_change_proposals
     WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND status IN ('pending','approved','applied')
       AND COALESCE(pattern->>'scope','unit_wide') <> 'reassignment'
       AND ABS(EXTRACT(EPOCH FROM (effective_from - NEW.effective_from)) / 86400) < 30
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'A cycle-pattern proposal "%" with effective date % is already in flight within 30 days of this one.',
        v_conflict.title, v_conflict.effective_from
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rotation_proposal_conflict
  ON public.rotation_change_proposals;
CREATE TRIGGER trg_rotation_proposal_conflict
  BEFORE INSERT OR UPDATE OF pattern, effective_from, status
  ON public.rotation_change_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.check_rotation_proposal_conflict();

-- =========================================
-- 2. Audit table
-- =========================================
CREATE TABLE IF NOT EXISTS public.rotation_change_proposal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.rotation_change_proposals(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected','withdrawn','applied','edited')),
  actor_user_id uuid NULL,
  actor_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_status text NULL,
  new_status text NULL,
  comment text NULL,
  snapshot jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rotation_audit_proposal
  ON public.rotation_change_proposal_audit(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rotation_audit_actor
  ON public.rotation_change_proposal_audit(actor_profile_id);

ALTER TABLE public.rotation_change_proposal_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rotation_audit_select_own_or_command"
  ON public.rotation_change_proposal_audit;
CREATE POLICY "rotation_audit_select_own_or_command"
  ON public.rotation_change_proposal_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rotation_change_proposals p
      JOIN public.profiles pr ON pr.id = p.proposer_id
      WHERE p.id = rotation_change_proposal_audit.proposal_id
        AND pr.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic')
    OR public.has_role(auth.uid(),'chief_staff_officer')
    OR public.has_role(auth.uid(),'head_of_administration')
    OR public.has_role(auth.uid(),'staff_officer')
    OR public.has_role(auth.uid(),'supervisor')
  );

-- No direct insert/update/delete from clients; only the trigger writes.
DROP POLICY IF EXISTS "rotation_audit_block_writes"
  ON public.rotation_change_proposal_audit;
CREATE POLICY "rotation_audit_block_writes"
  ON public.rotation_change_proposal_audit
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- =========================================
-- 3. Audit trigger
-- =========================================
CREATE OR REPLACE FUNCTION public.record_rotation_proposal_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile uuid;
  v_action text;
BEGIN
  SELECT id INTO v_actor_profile FROM public.profiles WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'submitted';
    INSERT INTO public.rotation_change_proposal_audit
      (proposal_id, action, actor_user_id, actor_profile_id,
       previous_status, new_status, comment, snapshot)
    VALUES
      (NEW.id, v_action, auth.uid(), COALESCE(v_actor_profile, NEW.proposer_id),
       NULL, NEW.status, NEW.summary,
       jsonb_build_object('title', NEW.title, 'effective_from', NEW.effective_from, 'pattern', NEW.pattern));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'withdrawn' THEN 'withdrawn'
      WHEN 'applied' THEN 'applied'
      ELSE 'edited'
    END;
    INSERT INTO public.rotation_change_proposal_audit
      (proposal_id, action, actor_user_id, actor_profile_id,
       previous_status, new_status, comment, snapshot)
    VALUES
      (NEW.id, v_action, auth.uid(), COALESCE(v_actor_profile, NEW.reviewer_id),
       OLD.status, NEW.status, NEW.review_comment,
       jsonb_build_object('title', NEW.title, 'effective_from', NEW.effective_from, 'pattern', NEW.pattern));
  ELSIF TG_OP = 'UPDATE' THEN
    -- non-status edits (rare; mostly blocked by guard trigger)
    INSERT INTO public.rotation_change_proposal_audit
      (proposal_id, action, actor_user_id, actor_profile_id,
       previous_status, new_status, comment, snapshot)
    VALUES
      (NEW.id, 'edited', auth.uid(), COALESCE(v_actor_profile, NEW.proposer_id),
       OLD.status, NEW.status, NEW.review_comment,
       jsonb_build_object('title', NEW.title, 'effective_from', NEW.effective_from, 'pattern', NEW.pattern));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rotation_proposal_audit
  ON public.rotation_change_proposals;
CREATE TRIGGER trg_rotation_proposal_audit
  AFTER INSERT OR UPDATE
  ON public.rotation_change_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.record_rotation_proposal_audit();