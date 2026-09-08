-- Harden the restrictive write policy on profiles: the previous
-- "org_unit_id IS NULL" branch allowed any role except staff_officer/supervisor
-- through the restrictive gate. Narrow it to admin/oic/2ic (self-writes are
-- already covered by the user_id = auth.uid() branch).
DROP POLICY IF EXISTS "Org scope restricts profile writes" ON public.profiles;

CREATE POLICY "Org scope restricts profile writes"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR (org_unit_id IS NOT NULL AND has_org_access(auth.uid(), org_unit_id))
  OR (
    org_unit_id IS NULL
    AND (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR (org_unit_id IS NOT NULL AND has_org_access(auth.uid(), org_unit_id))
  OR (
    org_unit_id IS NULL
    AND (has_role(auth.uid(), 'oic'::app_role) OR has_role(auth.uid(), '2ic'::app_role))
  )
);