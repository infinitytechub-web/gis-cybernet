DROP POLICY IF EXISTS "auth read firewall rules" ON public.firewall_rules;
CREATE POLICY "command tier read firewall rules"
ON public.firewall_rules
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
);