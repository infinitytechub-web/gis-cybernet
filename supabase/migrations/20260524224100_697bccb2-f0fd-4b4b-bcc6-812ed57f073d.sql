DROP POLICY IF EXISTS "System can insert inventory audit" ON public.medical_inventory_audit;
CREATE POLICY "System can insert inventory audit" ON public.medical_inventory_audit
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (performed_by IS NULL OR performed_by = auth.uid()));