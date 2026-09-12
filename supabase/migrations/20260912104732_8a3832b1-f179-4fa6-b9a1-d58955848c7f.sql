-- 1) Defense-in-depth: ensure profile rows can never be read (or broadcast via Realtime)
-- by unauthenticated subscribers, regardless of future permissive policy changes.
DROP POLICY IF EXISTS "Profiles require authenticated session" ON public.profiles;
CREATE POLICY "Profiles require authenticated session"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO public
USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.profiles FROM anon;

-- 2) Make sure webhook signing secrets are never published to Realtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'security_monitor_webhooks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.security_monitor_webhooks';
  END IF;
END $$;

REVOKE ALL ON public.security_monitor_webhooks FROM anon, authenticated;
GRANT ALL ON public.security_monitor_webhooks TO service_role;