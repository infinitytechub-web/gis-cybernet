
-- Fix 1: Allow uploaders to view their own reports
CREATE POLICY "Uploaders can view own reports"
ON public.report_uploads FOR SELECT TO authenticated
USING (uploaded_by = auth.uid());

-- Fix 2: Supervisors can view visa_extensions for their department
CREATE POLICY "Supervisors can view department visa extensions"
ON public.visa_extensions FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'oic') OR public.has_role(auth.uid(), '2ic'))
  AND processed_by IN (
    SELECT p.user_id FROM public.profiles p
    WHERE p.department_id = public.get_user_department_id(auth.uid())
  )
);

-- Fix 3: system_audit_log INSERT - the log_system_audit trigger runs as SECURITY DEFINER so it bypasses RLS,
-- but add an explicit policy for safety
CREATE POLICY "Authenticated users can insert audit entries"
ON public.system_audit_log FOR INSERT TO authenticated
WITH CHECK (true);
