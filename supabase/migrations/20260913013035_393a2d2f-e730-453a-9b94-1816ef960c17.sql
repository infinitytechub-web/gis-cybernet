-- Functions created without an explicit grant carry an implicit PUBLIC EXECUTE
-- grant (shown as `=X/...` in the ACL), which lets the signed-out role call
-- them. Drop PUBLIC and keep the explicit authenticated/service_role grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS ident
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname NOT IN ('get_public_branding', 'get_recaptcha_config')
       AND (p.proacl IS NULL OR EXISTS (
             SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0
           ))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.ident);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
