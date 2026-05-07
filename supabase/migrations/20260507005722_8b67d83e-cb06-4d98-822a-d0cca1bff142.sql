-- Tighten RLS on medical_inventory_audit
ALTER TABLE public.medical_inventory_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_inventory_audit FORCE ROW LEVEL SECURITY;

-- Drop existing permissive policies and recreate strict ones
DROP POLICY IF EXISTS "Command can read inventory audit" ON public.medical_inventory_audit;
DROP POLICY IF EXISTS "System can insert inventory audit" ON public.medical_inventory_audit;
DROP POLICY IF EXISTS "No direct insert inventory audit" ON public.medical_inventory_audit;
DROP POLICY IF EXISTS "No direct update inventory audit" ON public.medical_inventory_audit;
DROP POLICY IF EXISTS "No direct delete inventory audit" ON public.medical_inventory_audit;

-- SELECT: only Admin + Command tier + Head of Administration
CREATE POLICY "Authorized roles can read inventory audit"
  ON public.medical_inventory_audit
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'head_of_administration'::app_role)
  );

-- Block all direct writes; trigger runs SECURITY DEFINER and bypasses RLS
CREATE POLICY "No direct insert inventory audit"
  ON public.medical_inventory_audit FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "No direct update inventory audit"
  ON public.medical_inventory_audit FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "No direct delete inventory audit"
  ON public.medical_inventory_audit FOR DELETE TO authenticated USING (false);