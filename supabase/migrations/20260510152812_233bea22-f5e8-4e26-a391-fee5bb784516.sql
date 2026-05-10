
ALTER POLICY "Command tier reviews shift change requests"
  ON public.shift_change_requests TO authenticated;
ALTER POLICY "Command tier views all shift change requests"
  ON public.shift_change_requests TO authenticated;
ALTER POLICY "Users cancel their own pending requests"
  ON public.shift_change_requests TO authenticated;
ALTER POLICY "Users create their own shift change requests"
  ON public.shift_change_requests TO authenticated;
ALTER POLICY "Users view their own shift change requests"
  ON public.shift_change_requests TO authenticated;

ALTER POLICY "Front desk can view own processed visa extensions"
  ON public.visa_extensions TO authenticated;

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

  RETURN QUERY
  SELECT
    pt.tablename::text,
    c.relrowsecurity,
    c.relforcerowsecurity,
    COALESCE((SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = pt.tablename), 0),
    COALESCE((SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = pt.tablename
                AND (p.cmd = 'SELECT' OR p.cmd = 'ALL')), 0),
    COALESCE((SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = pt.tablename
                AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles))), 0),
    EXISTS (SELECT 1 FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = pt.tablename
              AND (p.cmd = 'SELECT' OR p.cmd = 'ALL')
              AND p.qual = 'true'
              AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles)))
  FROM pg_publication_tables pt
  JOIN pg_class c ON c.relname = pt.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = pt.schemaname
  WHERE pt.pubname = 'supabase_realtime'
    AND pt.schemaname = 'public'
  ORDER BY pt.tablename;
END;
$$;

REVOKE ALL ON FUNCTION public.get_realtime_rls_coverage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_realtime_rls_coverage() TO authenticated;
