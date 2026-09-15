DROP POLICY IF EXISTS "Profiles require authenticated session" ON public.profiles;

CREATE POLICY "Profile reads restricted to owner or oversight"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR (
      org_unit_id IS NOT NULL
      AND has_profile_oversight_role(auth.uid())
      AND has_org_access(auth.uid(), org_unit_id)
    )
    OR (
      department_id IS NOT NULL
      AND department_id = get_user_department_id(auth.uid())
      AND (
        has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'shift_supervisor'::app_role)
        OR has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
        OR has_role(auth.uid(), 'shift_leader'::app_role)
      )
    )
  )
);