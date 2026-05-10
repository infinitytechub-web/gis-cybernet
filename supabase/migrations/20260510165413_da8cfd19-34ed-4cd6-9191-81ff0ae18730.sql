-- App settings: auto-scan controls
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS security_scan_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_scan_frequency text NOT NULL DEFAULT 'weekly'
    CHECK (security_scan_frequency IN ('daily','weekly','monthly')),
  ADD COLUMN IF NOT EXISTS security_scan_last_run_at timestamptz;

-- Scan runs log
CREATE TABLE IF NOT EXISTS public.security_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_kind text NOT NULL DEFAULT 'manual' CHECK (trigger_kind IN ('manual','auto')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  total_checks integer NOT NULL DEFAULT 0,
  passed_count integer NOT NULL DEFAULT 0,
  warn_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS security_scan_runs_started_at_idx
  ON public.security_scan_runs (started_at DESC);

ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read security scan runs" ON public.security_scan_runs;
CREATE POLICY "Admins can read security scan runs"
  ON public.security_scan_runs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert security scan runs" ON public.security_scan_runs;
CREATE POLICY "Admins can insert security scan runs"
  ON public.security_scan_runs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND triggered_by = auth.uid());

DROP POLICY IF EXISTS "Admins can update security scan runs" ON public.security_scan_runs;
CREATE POLICY "Admins can update security scan runs"
  ON public.security_scan_runs FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Server-side checks: an admin-callable RPC that performs hygiene checks
-- against the public schema (RLS coverage, definer search_path, permissive
-- write policies). Returns a JSON array of findings.
CREATE OR REPLACE FUNCTION public.run_security_hygiene_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  findings jsonb := '[]'::jsonb;
  rec record;
  cnt integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run the security hygiene scan';
  END IF;

  -- 1. Tables in `public` without RLS enabled
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    findings := findings || jsonb_build_object(
      'check', 'rls_disabled',
      'severity', 'error',
      'title', format('Table public.%s has RLS disabled', rec.relname),
      'detail', 'Enable Row Level Security on this table to prevent unrestricted access.'
    );
  END LOOP;

  -- 2. Tables with RLS but zero policies
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
      )
  LOOP
    findings := findings || jsonb_build_object(
      'check', 'rls_no_policies',
      'severity', 'warn',
      'title', format('Table public.%s has RLS but no policies', rec.relname),
      'detail', 'RLS denies all access by default. Either add policies or document this as intentional.'
    );
  END LOOP;

  -- 3. SECURITY DEFINER functions in public without a fixed search_path
  FOR rec IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    findings := findings || jsonb_build_object(
      'check', 'definer_no_search_path',
      'severity', 'warn',
      'title', format('Function public.%s is SECURITY DEFINER without a fixed search_path', rec.proname),
      'detail', 'Add SET search_path = public to prevent search-path hijacking.'
    );
  END LOOP;

  -- 4. Permissive write policies (USING/WITH CHECK = true) for INSERT/UPDATE/DELETE
  FOR rec IN
    SELECT pol.polname, c.relname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND pol.polcmd IN ('w','d','a')  -- update, delete, insert
      AND (
        pg_get_expr(pol.polqual, pol.polrelid) = 'true'
        OR pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true'
      )
  LOOP
    findings := findings || jsonb_build_object(
      'check', 'permissive_write_policy',
      'severity', 'error',
      'title', format('Policy "%s" on public.%s permits unrestricted writes', rec.polname, rec.relname),
      'detail', 'Replace USING/WITH CHECK (true) with a role- or owner-scoped predicate.'
    );
  END LOOP;

  -- 5. Migrations applied (informational)
  SELECT count(*) INTO cnt FROM supabase_migrations.schema_migrations;
  findings := findings || jsonb_build_object(
    'check', 'migrations_applied',
    'severity', 'info',
    'title', format('%s database migrations applied', cnt),
    'detail', 'Number of migration files committed to schema_migrations.'
  );

  RETURN findings;
END;
$$;

REVOKE ALL ON FUNCTION public.run_security_hygiene_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_security_hygiene_scan() TO authenticated;