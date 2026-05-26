-- Remove permissive INSERT policy on medical_inventory_audit that overrides the deny rule.
-- Audit inserts must go through SECURITY DEFINER triggers/functions running as service role.
DROP POLICY IF EXISTS "System can insert inventory audit" ON public.medical_inventory_audit;