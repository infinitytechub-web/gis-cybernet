ALTER TABLE public.front_desk_audit_log ALTER COLUMN performed_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.front_desk_audit_log;

CREATE POLICY "Authenticated users can create audit logs"
ON public.front_desk_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND (has_role(auth.uid(), 'front_desk'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);