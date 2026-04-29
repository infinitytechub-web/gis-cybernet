-- Drop overly-permissive SELECT policy on forced_signouts
DROP POLICY IF EXISTS "Authenticated users can view forced signouts" ON public.forced_signouts;
DROP POLICY IF EXISTS "All authenticated users can view forced signouts" ON public.forced_signouts;
DROP POLICY IF EXISTS "Authenticated can view forced signouts" ON public.forced_signouts;
DROP POLICY IF EXISTS "View forced signouts" ON public.forced_signouts;
DROP POLICY IF EXISTS "Anyone authenticated can view forced signouts" ON public.forced_signouts;

-- Find and drop any remaining permissive SELECT policies on this table
DO $$
DECLARE
  _pol record;
BEGIN
  FOR _pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'forced_signouts' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.forced_signouts', _pol.policyname);
  END LOOP;
END $$;

-- Restrict SELECT to admin and command-tier only
CREATE POLICY "Command tier can view forced signouts"
ON public.forced_signouts
FOR SELECT
TO authenticated
USING (public.is_command_tier(auth.uid()));
