-- Allow OIC, 2IC, staff_officer, and any supervisor to manage MISD unit assignments
-- (in addition to admins and MISD/CYBER supervisors who already had access).
DROP POLICY IF EXISTS "Manage misd unit assignments" ON public.misd_unit_assignments;

CREATE POLICY "Manage misd unit assignments"
ON public.misd_unit_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.is_misd_supervisor(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.is_misd_supervisor(auth.uid())
);