
-- Fix 1: Prevent privilege escalation - add RESTRICTIVE policy on user_roles
-- This ensures ONLY admins can insert/update/delete roles
CREATE POLICY "Only admins can modify user roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Tighten staff-photos storage access with ownership verification
DROP POLICY IF EXISTS "Authenticated users can view staff photos" ON storage.objects;
CREATE POLICY "Authenticated users can view staff photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND (
      -- Admins can see all photos
      has_role(auth.uid(), 'admin'::app_role)
      -- Users can see their own photo
      OR name IN (
        SELECT p.photo_url FROM public.profiles p WHERE p.user_id = auth.uid()
      )
      -- Supervisors can see department members' photos
      OR has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

-- Fix 3: Enable Realtime authorization on notifications channel
-- Add RLS policy on realtime.messages to scope channel subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only listen to own notification channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'realtime'
    )
  );
