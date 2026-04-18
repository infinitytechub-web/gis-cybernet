
-- Allow command-tier roles to view ALL Front Desk applications (cross-department oversight)
-- and to update status for approvals workflow.

-- Roles in scope: supervisor, staff_officer, shift_supervisor, deputy_shift_supervisor
-- (admin, oic, 2ic already have ALL)

-- =================== visa_applications ===================
DROP POLICY IF EXISTS "Command tier can view all visa applications" ON public.visa_applications;
CREATE POLICY "Command tier can view all visa applications"
  ON public.visa_applications FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

DROP POLICY IF EXISTS "Command tier can approve visa applications" ON public.visa_applications;
CREATE POLICY "Command tier can approve visa applications"
  ON public.visa_applications FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  );

-- =================== visa_extensions ===================
DROP POLICY IF EXISTS "Command tier can view all visa extensions" ON public.visa_extensions;
CREATE POLICY "Command tier can view all visa extensions"
  ON public.visa_extensions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

DROP POLICY IF EXISTS "Command tier can approve visa extensions" ON public.visa_extensions;
CREATE POLICY "Command tier can approve visa extensions"
  ON public.visa_extensions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  );

-- =================== passport_applications ===================
DROP POLICY IF EXISTS "Command tier can view all passport applications" ON public.passport_applications;
CREATE POLICY "Command tier can view all passport applications"
  ON public.passport_applications FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

DROP POLICY IF EXISTS "Command tier can approve passport applications" ON public.passport_applications;
CREATE POLICY "Command tier can approve passport applications"
  ON public.passport_applications FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  );

-- =================== official_applications ===================
DROP POLICY IF EXISTS "Command tier can view all official applications" ON public.official_applications;
CREATE POLICY "Command tier can view all official applications"
  ON public.official_applications FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

DROP POLICY IF EXISTS "Command tier can approve official applications" ON public.official_applications;
CREATE POLICY "Command tier can approve official applications"
  ON public.official_applications FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  );

-- =================== enquiry_applications ===================
DROP POLICY IF EXISTS "Command tier can view all enquiry applications" ON public.enquiry_applications;
CREATE POLICY "Command tier can view all enquiry applications"
  ON public.enquiry_applications FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'shift_supervisor')
    OR public.has_role(auth.uid(), 'deputy_shift_supervisor')
  );

DROP POLICY IF EXISTS "Command tier can approve enquiry applications" ON public.enquiry_applications;
CREATE POLICY "Command tier can approve enquiry applications"
  ON public.enquiry_applications FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'staff_officer')
  );
