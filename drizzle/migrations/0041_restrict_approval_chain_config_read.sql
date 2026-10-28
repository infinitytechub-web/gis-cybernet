DROP POLICY IF EXISTS acc_read ON public.approval_chain_config;
CREATE POLICY acc_read ON public.approval_chain_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_detention(auth.uid()));