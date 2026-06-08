DROP POLICY IF EXISTS "auth read firewall settings" ON public.firewall_settings;

CREATE POLICY "command tier read firewall settings"
ON public.firewall_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'staff_officer'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);