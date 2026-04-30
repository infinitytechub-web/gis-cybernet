-- Force RLS so even superusers/owners go through policies
ALTER TABLE public.command_role_audit FORCE ROW LEVEL SECURITY;

-- Make the trail immutable: deny UPDATE and DELETE to everyone via RESTRICTIVE policies.
DROP POLICY IF EXISTS "No one can update command role audit" ON public.command_role_audit;
CREATE POLICY "No one can update command role audit"
  ON public.command_role_audit
  AS RESTRICTIVE
  FOR UPDATE
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No one can delete command role audit" ON public.command_role_audit;
CREATE POLICY "No one can delete command role audit"
  ON public.command_role_audit
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (false);

-- Reaffirm the read/write policies are admin-only (idempotent)
DROP POLICY IF EXISTS "Admins can view command role audit" ON public.command_role_audit;
CREATE POLICY "Admins can view command role audit"
  ON public.command_role_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert command role audit" ON public.command_role_audit;
CREATE POLICY "Admins can insert command role audit"
  ON public.command_role_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND auth.uid() IS NOT NULL
    AND changed_by = auth.uid()  -- prevent spoofing the actor
  );