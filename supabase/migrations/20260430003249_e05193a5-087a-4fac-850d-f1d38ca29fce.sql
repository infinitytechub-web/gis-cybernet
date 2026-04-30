-- Tighten compliance_upload_audit visibility:
-- only Admin / OIC / 2IC and the affected staff member can read entries.
DROP POLICY IF EXISTS "Uploader can view own compliance audit" ON public.compliance_upload_audit;
DROP POLICY IF EXISTS "Supervisors view dept compliance audit" ON public.compliance_upload_audit;
DROP POLICY IF EXISTS "Command tier views compliance audit" ON public.compliance_upload_audit;

CREATE POLICY "Command tier views compliance audit"
  ON public.compliance_upload_audit FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
  );

-- "Target staff can view their compliance audit" already exists and stays as-is.

-- Enable realtime so the upload-progress panel and audit dialog
-- update live as audit rows are written.
ALTER TABLE public.compliance_upload_audit REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_upload_audit;