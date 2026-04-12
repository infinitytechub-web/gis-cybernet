
DROP POLICY "System can insert audit logs" ON public.system_audit_log;

-- The trigger function runs as SECURITY DEFINER so it bypasses RLS.
-- No explicit INSERT policy needed for regular users.
-- But we need to allow the trigger (which runs as function owner) to insert.
-- Since the trigger is SECURITY DEFINER, it bypasses RLS entirely.
-- We can remove the permissive policy safely.
