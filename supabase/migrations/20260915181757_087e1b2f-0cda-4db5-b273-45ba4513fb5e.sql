-- 1. Directory permission matrix: restrict reads to admin / command tier.
DROP POLICY IF EXISTS "Authenticated can read directory permissions" ON public.directory_permissions;

CREATE POLICY "Command tier can read directory permissions"
ON public.directory_permissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_command_tier(auth.uid()));

-- 2. Realtime payload minimisation: stop broadcasting full old rows (PII) on UPDATE/DELETE.
ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;
ALTER TABLE public.directory_permissions REPLICA IDENTITY DEFAULT;

-- 3. Shift rotation settings do not need Realtime; the admin UI refetches after its own writes.
ALTER PUBLICATION supabase_realtime DROP TABLE public.shift_rotation_config;
ALTER PUBLICATION supabase_realtime DROP TABLE public.shift_rotation_overrides;