-- ════════════════════════════════════════════════════════════════════
-- Shift Rotation Change Proposals — propose-then-approve workflow
-- ════════════════════════════════════════════════════════════════════

-- 1. Helper: who may PROPOSE a rotation change
CREATE OR REPLACE FUNCTION public.can_propose_rotation_change(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'staff_officer'::app_role)
    OR public.has_role(_uid, 'oic'::app_role)
    OR public.has_role(_uid, '2ic'::app_role)
    OR public.has_role(_uid, 'supervisor'::app_role)
    OR public.has_role(_uid, 'ipse_supervisor'::app_role)
$$;
REVOKE ALL ON FUNCTION public.can_propose_rotation_change(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_propose_rotation_change(uuid) TO authenticated;

-- 2. Helper: who may APPROVE a rotation change
CREATE OR REPLACE FUNCTION public.can_approve_rotation_change(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'oic'::app_role)
    OR public.has_role(_uid, '2ic'::app_role)
    OR public.has_role(_uid, 'chief_staff_officer'::app_role)
    OR public.has_role(_uid, 'head_of_administration'::app_role)
$$;
REVOKE ALL ON FUNCTION public.can_approve_rotation_change(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_approve_rotation_change(uuid) TO authenticated;

-- 3. Table
CREATE TABLE IF NOT EXISTS public.rotation_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposer_user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 160),
  summary text NOT NULL CHECK (length(btrim(summary)) >= 10),
  pattern jsonb NOT NULL,
  effective_from date NOT NULL,
  affected_profile_ids uuid[] NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','withdrawn','applied')),
  reviewer_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_comment text NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rotation_proposals_status
  ON public.rotation_change_proposals(status);
CREATE INDEX IF NOT EXISTS idx_rotation_proposals_proposer
  ON public.rotation_change_proposals(proposer_id);
CREATE INDEX IF NOT EXISTS idx_rotation_proposals_effective
  ON public.rotation_change_proposals(effective_from);

ALTER TABLE public.rotation_change_proposals ENABLE ROW LEVEL SECURITY;

-- 4. RLS
DROP POLICY IF EXISTS "Proposer reads own; approvers read all"
  ON public.rotation_change_proposals;
CREATE POLICY "Proposer reads own; approvers read all"
  ON public.rotation_change_proposals
  FOR SELECT
  TO authenticated
  USING (
    proposer_user_id = auth.uid()
    OR public.can_approve_rotation_change(auth.uid())
  );

DROP POLICY IF EXISTS "Authorised proposers may submit"
  ON public.rotation_change_proposals;
CREATE POLICY "Authorised proposers may submit"
  ON public.rotation_change_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_propose_rotation_change(auth.uid())
    AND proposer_user_id = auth.uid()
    AND status = 'pending'
  );

-- Proposer may withdraw a pending proposal; approvers may decide.
DROP POLICY IF EXISTS "Proposer withdraws or approver decides"
  ON public.rotation_change_proposals;
CREATE POLICY "Proposer withdraws or approver decides"
  ON public.rotation_change_proposals
  FOR UPDATE
  TO authenticated
  USING (
    (proposer_user_id = auth.uid() AND status = 'pending')
    OR public.can_approve_rotation_change(auth.uid())
  )
  WITH CHECK (
    (proposer_user_id = auth.uid() AND status IN ('pending','withdrawn'))
    OR public.can_approve_rotation_change(auth.uid())
  );

DROP POLICY IF EXISTS "Admins may delete proposals"
  ON public.rotation_change_proposals;
CREATE POLICY "Admins may delete proposals"
  ON public.rotation_change_proposals
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Guard trigger: prevent silent rewrites of identity / audit fields
CREATE OR REPLACE FUNCTION public.guard_rotation_proposal_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Identity fields are immutable
  IF NEW.proposer_id <> OLD.proposer_id
     OR NEW.proposer_user_id <> OLD.proposer_user_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Identity fields on a rotation proposal cannot be changed';
  END IF;

  -- Decided records are locked except for admins
  IF OLD.status IN ('approved','rejected','withdrawn','applied')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'This proposal has already been finalised';
  END IF;

  -- If status is moving away from 'pending' by an approver, stamp reviewer
  IF NEW.status <> OLD.status
     AND NEW.status IN ('approved','rejected','applied')
     AND public.can_approve_rotation_change(auth.uid()) THEN
    NEW.reviewer_id := COALESCE(
      NEW.reviewer_id,
      (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    );
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_rotation_proposal_update
  ON public.rotation_change_proposals;
CREATE TRIGGER trg_guard_rotation_proposal_update
  BEFORE UPDATE ON public.rotation_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_rotation_proposal_update();