-- Restrict SELECT on attendance_report_recipients to command tier only
DROP POLICY IF EXISTS "Authenticated can view recipients" ON public.attendance_report_recipients;

CREATE POLICY "Command tier can view recipients"
ON public.attendance_report_recipients
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
);