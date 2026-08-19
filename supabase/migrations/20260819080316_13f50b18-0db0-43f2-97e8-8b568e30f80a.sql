DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN ('get_public_branding', 'get_public_app_settings')
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;