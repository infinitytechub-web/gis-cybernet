
-- Grant shift_supervisor, deputy_shift_supervisor, and shift_leader department-scoped SELECT on profiles
CREATE POLICY "Shift roles can view department profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  (
    has_role(auth.uid(), 'shift_supervisor'::app_role)
    OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
    OR has_role(auth.uid(), 'shift_leader'::app_role)
  )
  AND department_id = get_user_department_id(auth.uid())
);

-- Grant OIC and 2IC full SELECT on all profiles (they already have high access)
CREATE POLICY "OIC and 2IC can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
);
