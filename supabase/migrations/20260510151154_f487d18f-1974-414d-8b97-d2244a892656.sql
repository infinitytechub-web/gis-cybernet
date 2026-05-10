-- Restrict firewall_threat_entries SELECT to admin + command tier
DROP POLICY IF EXISTS "auth read firewall threats" ON public.firewall_threat_entries;
CREATE POLICY "Command tier reads firewall threat entries"
ON public.firewall_threat_entries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_command_tier(auth.uid()));

-- Lock down recycle_bin INSERT — only the SECURITY DEFINER soft_delete_record RPC writes here
DROP POLICY IF EXISTS "Authenticated users can add to bin via RPC" ON public.recycle_bin;
CREATE POLICY "Only privileged roles can insert into recycle bin"
ON public.recycle_bin
FOR INSERT
TO authenticated
WITH CHECK (public.can_use_recycle_bin(auth.uid()));