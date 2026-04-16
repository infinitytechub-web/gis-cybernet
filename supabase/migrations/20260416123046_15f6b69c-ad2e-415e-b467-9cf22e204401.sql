
-- Fix 1: Restrict can_access_report_file to admins, supervisors+OIC+2IC, and uploaders only
CREATE OR REPLACE FUNCTION public.can_access_report_file(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.report_uploads r
      WHERE r.file_path = _file_path
        AND (
          -- Supervisors/OIC/2IC can access their department's reports
          ((public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'))
            AND r.department_id = public.get_user_department_id(auth.uid()))
          -- Uploader can access their own uploads
          OR r.uploaded_by = auth.uid()
        )
    )
$$;

-- Fix 2: Restrict front desk UPDATE on visa_applications to own records
DROP POLICY IF EXISTS "Front desk can update visa applications" ON public.visa_applications;
CREATE POLICY "Front desk can update own processed visa applications"
ON public.visa_applications FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid())
WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());

-- Also restrict front desk SELECT on visa_applications to own records (matching other tables)
DROP POLICY IF EXISTS "Front desk can view visa applications" ON public.visa_applications;
CREATE POLICY "Front desk can view own processed visa applications"
ON public.visa_applications FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'front_desk'::app_role) AND processed_by = auth.uid());

-- Add auto-set processed_by trigger for visa_applications
CREATE OR REPLACE FUNCTION public.set_visa_app_processed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.processed_by IS NULL THEN
    NEW.processed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_visa_app_processed_by ON public.visa_applications;
CREATE TRIGGER trg_set_visa_app_processed_by
BEFORE INSERT ON public.visa_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_visa_app_processed_by();
