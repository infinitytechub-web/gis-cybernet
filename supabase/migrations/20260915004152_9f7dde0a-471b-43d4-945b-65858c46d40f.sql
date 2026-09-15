DROP POLICY IF EXISTS me_verif_read ON public.me_verifications;
CREATE POLICY me_verif_read ON public.me_verifications
  FOR SELECT TO authenticated
  USING (
    public.me_can_manage()
    OR public.me_can_verify()
    OR verified_by = auth.uid()
  );

DROP POLICY IF EXISTS workflow_transitions_read ON public.workflow_transitions;
CREATE POLICY workflow_transitions_read ON public.workflow_transitions
  FOR SELECT TO authenticated
  USING (
    public.has_profile_oversight_role(auth.uid())
    OR performed_by = auth.uid()
  );