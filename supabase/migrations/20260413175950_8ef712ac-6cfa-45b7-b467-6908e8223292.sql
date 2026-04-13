
-- OIC and 2IC: Full access to front desk tables
CREATE POLICY "OIC and 2IC can manage passport applications"
ON public.passport_applications FOR ALL TO authenticated
USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
WITH CHECK (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

CREATE POLICY "OIC and 2IC can manage visa applications"
ON public.visa_applications FOR ALL TO authenticated
USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
WITH CHECK (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

CREATE POLICY "OIC and 2IC can manage visa extensions"
ON public.visa_extensions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
WITH CHECK (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

CREATE POLICY "OIC and 2IC can view audit logs"
ON public.front_desk_audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role));

-- Drop old staff-only policies
DROP POLICY IF EXISTS "Staff can view department passport applications" ON public.passport_applications;
DROP POLICY IF EXISTS "Staff can view department visa applications" ON public.visa_applications;
DROP POLICY IF EXISTS "Staff can view department visa extensions" ON public.visa_extensions;

-- Shift roles: department-scoped read access
CREATE POLICY "Shift roles can view department passport applications"
ON public.passport_applications FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'shift_supervisor'::app_role) OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role) OR has_role(auth.uid(), 'shift_leader'::app_role))
  AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid()))
);

CREATE POLICY "Shift roles can view department visa applications"
ON public.visa_applications FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'shift_supervisor'::app_role) OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role) OR has_role(auth.uid(), 'shift_leader'::app_role))
  AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid()))
);

CREATE POLICY "Shift roles can view department visa extensions"
ON public.visa_extensions FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'shift_supervisor'::app_role) OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role) OR has_role(auth.uid(), 'shift_leader'::app_role))
  AND processed_by IN (SELECT p.user_id FROM profiles p WHERE p.department_id = get_user_department_id(auth.uid()))
);
