CREATE POLICY "Admins can update audit logs"
ON public.front_desk_audit_log
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete audit logs"
ON public.front_desk_audit_log
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));