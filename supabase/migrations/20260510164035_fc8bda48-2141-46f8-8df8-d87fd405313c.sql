-- 1) Restrict enforcement-photos SELECT to enforcement command tier
DROP POLICY IF EXISTS "Authenticated can view enforcement photos" ON storage.objects;
CREATE POLICY "Enforcement tier can view mugshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'enforcement-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'shift_supervisor'::app_role)
    OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
  )
);

-- 2) Remove ghost-insert path on system_audit_log
DROP POLICY IF EXISTS "System can insert audit entries" ON public.system_audit_log;
CREATE POLICY "Users can insert their own audit entries"
ON public.system_audit_log
FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid());