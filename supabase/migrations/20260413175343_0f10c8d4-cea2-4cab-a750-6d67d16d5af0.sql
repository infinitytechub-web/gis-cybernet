
-- Staff and shift leaders can view department passport applications
CREATE POLICY "Staff can view department passport applications"
ON public.passport_applications
FOR SELECT
TO authenticated
USING (
  (
    has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'shift_leader'::app_role)
  )
  AND processed_by IN (
    SELECT p.user_id FROM profiles p
    WHERE p.department_id = get_user_department_id(auth.uid())
  )
);

-- Staff and shift leaders can view department visa applications
CREATE POLICY "Staff can view department visa applications"
ON public.visa_applications
FOR SELECT
TO authenticated
USING (
  (
    has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'shift_leader'::app_role)
  )
  AND processed_by IN (
    SELECT p.user_id FROM profiles p
    WHERE p.department_id = get_user_department_id(auth.uid())
  )
);

-- Staff and shift leaders can view department visa extensions
CREATE POLICY "Staff can view department visa extensions"
ON public.visa_extensions
FOR SELECT
TO authenticated
USING (
  (
    has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'shift_leader'::app_role)
  )
  AND processed_by IN (
    SELECT p.user_id FROM profiles p
    WHERE p.department_id = get_user_department_id(auth.uid())
  )
);
