
-- Fix 1: Remove system_audit_log from Realtime publication to prevent non-admin users from subscribing
ALTER PUBLICATION supabase_realtime DROP TABLE public.system_audit_log;

-- Fix 2: Fix can_access_report_file - remove the OR NOT EXISTS bypass clause
CREATE OR REPLACE FUNCTION public.can_access_report_file(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Admins always have access
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.report_uploads r
      WHERE r.file_path = _file_path
        AND (
          -- Supervisors can access their department's reports
          (public.has_role(auth.uid(), 'supervisor') AND r.department_id = public.get_user_department_id(auth.uid()))
          -- Staff can access their department's reports
          OR r.department_id = public.get_user_department_id(auth.uid())
          -- Uploader can access their own uploads
          OR r.uploaded_by = auth.uid()
        )
    )
$$;

-- Fix 3: Replace overly broad supervisor storage policy with department-scoped one
DROP POLICY IF EXISTS "Supervisors can view report files" ON storage.objects;

CREATE POLICY "Supervisors can view report files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'reports'
  AND public.has_role(auth.uid(), 'supervisor')
  AND public.can_access_report_file(name)
);
