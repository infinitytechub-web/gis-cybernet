-- Least privilege for the signed-out (anon) role: the app performs no
-- unauthenticated table reads (login/reset/2FA/unsubscribe use RPCs or edge
-- functions), so anon needs no table, view, sequence or function rights beyond
-- the two public login-screen routines.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS ident, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', r.ident);
  END LOOP;

  FOR r IN
    SELECT c.oid::regclass AS ident
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon', r.ident);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS ident
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname NOT IN ('get_public_branding', 'get_recaptcha_config')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.ident);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon;
GRANT EXECUTE ON FUNCTION public.get_recaptcha_config() TO anon;
