-- OIC/2IC previously read every officer's full record (DOB, Ghana Card) service-wide.
-- Scope them to their own command subtree; administrators keep service-wide access.

DROP POLICY IF EXISTS "OIC and 2IC can view all profiles" ON public.profiles;

CREATE POLICY "OIC and 2IC can view profiles in their command"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
  AND org_unit_id IS NOT NULL
  AND has_org_access(auth.uid(), org_unit_id)
);

DROP POLICY IF EXISTS "Profile reads restricted to owner or oversight" ON public.profiles;

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
    OR (
      org_unit_id IS NOT NULL
      AND has_org_access(auth.uid(), org_unit_id)
      AND (
        has_role(auth.uid(), 'oic'::app_role)
        OR has_role(auth.uid(), '2ic'::app_role)
        OR has_profile_oversight_role(auth.uid())
      )
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