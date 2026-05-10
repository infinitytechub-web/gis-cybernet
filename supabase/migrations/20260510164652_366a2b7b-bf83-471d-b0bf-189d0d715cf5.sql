DROP FUNCTION IF EXISTS public.purge_old_presence_events(integer);

CREATE FUNCTION public.purge_old_presence_events(_retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF _retention_days IS NULL OR _retention_days < 1 OR _retention_days > 365 THEN
    RAISE EXCEPTION 'Retention days must be between 1 and 365' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.presence_events
  WHERE created_at < (now() - make_interval(days => _retention_days));

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_presence_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_presence_events(integer) TO authenticated;