DROP POLICY IF EXISTS "Stores roles can view threshold audit" ON public.inventory_alert_overrides_audit;

CREATE POLICY "Stores roles can view threshold audit"
ON public.inventory_alert_overrides_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'storekeeper')
  OR public.has_role(auth.uid(), 'procurement_officer')
);