-- ATTENDANCES
DROP POLICY IF EXISTS "Command can view all attendance" ON public.attendances;
CREATE POLICY "Command can view all attendance"
ON public.attendances FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
);

-- LEAVE_REQUESTS
DROP POLICY IF EXISTS "Command can view all leave requests" ON public.leave_requests;
CREATE POLICY "Command can view all leave requests"
ON public.leave_requests FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
);

-- CERTIFICATIONS
DROP POLICY IF EXISTS "Command can view all certifications" ON public.certifications;
CREATE POLICY "Command can view all certifications"
ON public.certifications FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
);

-- EQUIPMENT_ISSUANCE
DROP POLICY IF EXISTS "Command can view all equipment" ON public.equipment_issuance;
CREATE POLICY "Command can view all equipment"
ON public.equipment_issuance FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
);

-- FRONT_DESK_AUDIT_LOG — staff_officer view (OIC/2IC already covered)
DROP POLICY IF EXISTS "Staff Officer can view audit logs" ON public.front_desk_audit_log;
CREATE POLICY "Staff Officer can view audit logs"
ON public.front_desk_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'staff_officer'::app_role));