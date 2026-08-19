CREATE POLICY "Users record their own status changes"
  ON public.status_change_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());