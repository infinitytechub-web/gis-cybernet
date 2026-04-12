
-- Fix 1: Add read-only SELECT policy for app_settings so all authenticated users can read settings
CREATE POLICY "Authenticated users can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- Fix 2: Replace overly permissive storage SELECT policy on reports bucket
-- First create a helper function to check report file access
CREATE OR REPLACE FUNCTION public.can_access_report_file(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.report_uploads r
    WHERE r.file_path = _file_path
      AND (
        -- Admins can access all
        public.has_role(auth.uid(), 'admin')
        -- Supervisors can access their department's reports
        OR (public.has_role(auth.uid(), 'supervisor') AND r.department_id = public.get_user_department_id(auth.uid()))
        -- Staff can access their department's reports
        OR r.department_id = public.get_user_department_id(auth.uid())
        -- Uploader can access their own uploads
        OR r.uploaded_by = auth.uid()
      )
  )
  -- Also allow if no matching report_uploads row (e.g. admin-uploaded without department)
  OR NOT EXISTS (
    SELECT 1 FROM public.report_uploads WHERE file_path = _file_path
  )
  -- Admins always have access
  OR public.has_role(auth.uid(), 'admin')
$$;

-- Drop the old overly permissive policy
DROP POLICY IF EXISTS "Staff can download report files" ON storage.objects;

-- Create restricted policy
CREATE POLICY "Users can download authorized report files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'reports'
  AND public.can_access_report_file(name)
);
