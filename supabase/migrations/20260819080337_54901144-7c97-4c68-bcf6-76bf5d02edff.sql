DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'execute') AS auth_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN ('get_public_branding', 'get_public_app_settings')
      AND p.proacl::text LIKE '%=X/%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    IF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

-- Login screen needs these two before sign-in.
GRANT EXECUTE ON FUNCTION public.get_public_app_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;