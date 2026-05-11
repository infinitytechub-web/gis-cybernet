
CREATE OR REPLACE FUNCTION public.get_realtime_rls_coverage()
RETURNS TABLE (
  table_name        text,
  rls_enabled       boolean,
  rls_forced        boolean,
  total_policies    bigint,
  select_policies   bigint,
  anon_reachable    bigint,
  permissive_select boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied: admin/oic/2ic only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.realtime_rls_coverage();
END;
$$;

REVOKE ALL ON FUNCTION public.get_realtime_rls_coverage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_realtime_rls_coverage() TO authenticated;
