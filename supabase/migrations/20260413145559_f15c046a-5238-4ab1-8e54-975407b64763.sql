-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Front desk can view passport applications" ON public.passport_applications;
DROP POLICY IF EXISTS "Front desk can update passport applications" ON public.passport_applications;

-- Front desk can only view applications they processed
CREATE POLICY "Front desk can view own processed passport applications"
ON public.passport_applications
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'front_desk'::app_role)
  AND processed_by = auth.uid()
);

-- Front desk can only update applications they processed
CREATE POLICY "Front desk can update own processed passport applications"
ON public.passport_applications
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'front_desk'::app_role)
  AND processed_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'front_desk'::app_role)
  AND processed_by = auth.uid()
);

-- Supervisors can only view applications processed by staff in their department
CREATE POLICY "Supervisors can view department passport applications"
ON public.passport_applications
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND processed_by IN (
    SELECT p.user_id FROM public.profiles p
    WHERE p.department_id = get_user_department_id(auth.uid())
  )
);