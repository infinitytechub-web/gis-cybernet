-- Add approval workflow columns
ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Validation trigger for approval_status values & required comment on reject
CREATE OR REPLACE FUNCTION public.validate_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;
  IF NEW.approval_status = 'rejected' AND (NEW.review_comment IS NULL OR length(trim(NEW.review_comment)) = 0) THEN
    RAISE EXCEPTION 'A review comment is required when rejecting a report';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_report_approval_trg ON public.report_uploads;
CREATE TRIGGER validate_report_approval_trg
BEFORE INSERT OR UPDATE ON public.report_uploads
FOR EACH ROW EXECUTE FUNCTION public.validate_report_approval();

-- Backfill submitted_by from uploaded_by for existing rows
UPDATE public.report_uploads SET submitted_by = uploaded_by WHERE submitted_by IS NULL;

-- Helper: is the user a shift leader-level role
CREATE OR REPLACE FUNCTION public.is_shift_leader_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'shift_supervisor')
      OR public.has_role(_user_id, 'deputy_shift_supervisor')
      OR public.has_role(_user_id, 'shift_leader')
      OR public.has_role(_user_id, 'deputy_shift_leader')
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user_id AND p.shift_group IS NOT NULL);
$$;

-- Helper: command tier (OIC, 2IC, staff officer, admin) — full visibility
CREATE OR REPLACE FUNCTION public.is_command_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'oic')
      OR public.has_role(_user_id, '2ic')
      OR public.has_role(_user_id, 'staff_officer');
$$;

-- Reset existing policies on report_uploads
DROP POLICY IF EXISTS "Admins can manage report uploads" ON public.report_uploads;
DROP POLICY IF EXISTS "Supervisors can manage department reports" ON public.report_uploads;
DROP POLICY IF EXISTS "Staff can view department reports" ON public.report_uploads;
DROP POLICY IF EXISTS "Supervisors can view department reports" ON public.report_uploads;
DROP POLICY IF EXISTS "Uploaders can view own reports" ON public.report_uploads;

-- SELECT policies
CREATE POLICY "Admins full access reports"
ON public.report_uploads FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Command tier views all reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (public.is_command_tier(auth.uid()));

CREATE POLICY "Supervisors view all reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Submitters view own reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (submitted_by = auth.uid() OR uploaded_by = auth.uid());

CREATE POLICY "All staff view approved reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (approval_status = 'approved');

-- INSERT — shift leader tier and above
CREATE POLICY "Shift leaders can submit reports"
ON public.report_uploads FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.is_shift_leader_tier(auth.uid())
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.is_command_tier(auth.uid())
  )
);

-- UPDATE — supervisors and command tier (approval); submitters can re-upload (limited via app)
CREATE POLICY "Supervisors approve reports"
ON public.report_uploads FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'supervisor') OR public.is_command_tier(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'supervisor') OR public.is_command_tier(auth.uid()));

CREATE POLICY "Submitters update own pending or rejected"
ON public.report_uploads FOR UPDATE TO authenticated
USING (submitted_by = auth.uid() AND approval_status IN ('pending','rejected'))
WITH CHECK (submitted_by = auth.uid());

-- DELETE — admin or submitter while pending/rejected
CREATE POLICY "Submitters delete own pending or rejected"
ON public.report_uploads FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (submitted_by = auth.uid() AND approval_status IN ('pending','rejected'))
);

-- Update storage access function to require approval for non-submitter access
CREATE OR REPLACE FUNCTION public.can_access_report_file(_file_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.report_uploads r
    WHERE r.file_path = _file_path
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.is_command_tier(auth.uid())
        OR public.has_role(auth.uid(), 'supervisor')
        OR r.submitted_by = auth.uid()
        OR r.uploaded_by = auth.uid()
        OR r.approval_status = 'approved'
      )
  );
$$;

-- Realtime
ALTER TABLE public.report_uploads REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='report_uploads';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.report_uploads';
  END IF;
END $$;