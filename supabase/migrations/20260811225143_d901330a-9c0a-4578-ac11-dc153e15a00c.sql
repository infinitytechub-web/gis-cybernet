DROP POLICY IF EXISTS "View inv categories" ON public.inventory_categories;
CREATE POLICY "View inv categories" ON public.inventory_categories
FOR SELECT TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
);

DROP POLICY IF EXISTS "View items" ON public.inventory_items;
CREATE POLICY "View items" ON public.inventory_items
FOR SELECT TO authenticated
USING (
  public.is_command_tier(auth.uid())
  OR public.has_role(auth.uid(), 'storekeeper'::app_role)
  OR public.has_role(auth.uid(), 'procurement_officer'::app_role)
);

DROP POLICY IF EXISTS "Authed read shift window overrides" ON public.shift_attendance_window_overrides;
CREATE POLICY "Command tier read shift window overrides" ON public.shift_attendance_window_overrides
FOR SELECT TO authenticated
USING (public.is_command_tier(auth.uid()));