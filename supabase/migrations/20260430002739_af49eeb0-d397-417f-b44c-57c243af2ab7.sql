-- Audit log for Compliance Management bulk uploads
CREATE TABLE public.compliance_upload_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  performed_by uuid NOT NULL,
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('documents','certifications')),
  file_name text NOT NULL,
  file_size bigint,
  file_type text,
  outcome text NOT NULL CHECK (outcome IN ('uploaded','failed')),
  error_message text,
  record_id uuid,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_upload_audit_batch ON public.compliance_upload_audit(batch_id);
CREATE INDEX idx_compliance_upload_audit_performer ON public.compliance_upload_audit(performed_by, created_at DESC);
CREATE INDEX idx_compliance_upload_audit_target ON public.compliance_upload_audit(target_profile_id, created_at DESC);

ALTER TABLE public.compliance_upload_audit ENABLE ROW LEVEL SECURITY;

-- Insert: any authenticated user, but only as themselves
CREATE POLICY "Users insert own compliance audit"
  ON public.compliance_upload_audit FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- Read: the uploader, the target staff member, command tier, supervisors of that staff
CREATE POLICY "Uploader can view own compliance audit"
  ON public.compliance_upload_audit FOR SELECT
  TO authenticated
  USING (performed_by = auth.uid());

CREATE POLICY "Target staff can view their compliance audit"
  ON public.compliance_upload_audit FOR SELECT
  TO authenticated
  USING (target_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Command tier views compliance audit"
  ON public.compliance_upload_audit FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  );

CREATE POLICY "Supervisors view dept compliance audit"
  ON public.compliance_upload_audit FOR SELECT
  TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), target_profile_id));

-- Admin full management
CREATE POLICY "Admins manage compliance audit"
  ON public.compliance_upload_audit FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));