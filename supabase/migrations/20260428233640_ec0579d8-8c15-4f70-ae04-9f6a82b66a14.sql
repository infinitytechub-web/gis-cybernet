-- Allow admins to delete any shift platform connection (for purge from admin tray).
CREATE POLICY "Admins can delete all connections"
  ON public.shift_platform_connections FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Helper for admins to purge all shift platform connections in one call.
CREATE OR REPLACE FUNCTION public.admin_purge_shift_connections()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can purge shift platform connections';
  END IF;
  DELETE FROM public.shift_platform_connections;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;