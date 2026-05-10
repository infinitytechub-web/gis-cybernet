
CREATE TABLE IF NOT EXISTS public.mfa_review_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.passport_applications(id) ON DELETE CASCADE,
  reviewer_id UUID,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_review_audit_app ON public.mfa_review_audit(application_id);
CREATE INDEX IF NOT EXISTS idx_mfa_review_audit_reviewer ON public.mfa_review_audit(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_mfa_review_audit_at ON public.mfa_review_audit(reviewed_at DESC);

ALTER TABLE public.mfa_review_audit ENABLE ROW LEVEL SECURITY;

-- Read access: command tier + processing/front-desk roles
CREATE POLICY "command and processing can read mfa audit"
ON public.mfa_review_audit FOR SELECT
TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'head_of_processing'::app_role)
  OR public.has_role(auth.uid(), 'deputy_head_of_processing'::app_role)
  OR public.has_role(auth.uid(), 'front_desk'::app_role)
);

-- No client-side INSERT/UPDATE/DELETE policies — only the trigger writes (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.log_mfa_review_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mfa_review_status IS DISTINCT FROM OLD.mfa_review_status THEN
    INSERT INTO public.mfa_review_audit(
      application_id, reviewer_id, previous_status, new_status, reviewer_notes, reviewed_at
    ) VALUES (
      NEW.id,
      NEW.mfa_reviewed_by,
      OLD.mfa_review_status,
      NEW.mfa_review_status,
      NEW.mfa_review_notes,
      COALESCE(NEW.mfa_reviewed_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mfa_review_change ON public.passport_applications;
CREATE TRIGGER trg_log_mfa_review_change
AFTER UPDATE OF mfa_review_status ON public.passport_applications
FOR EACH ROW EXECUTE FUNCTION public.log_mfa_review_change();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mfa_review_audit;
