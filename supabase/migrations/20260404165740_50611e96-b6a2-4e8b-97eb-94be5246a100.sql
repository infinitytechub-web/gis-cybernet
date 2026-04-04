
-- Fix 1: Replace weak realtime policy with proper topic-based scoping
DROP POLICY IF EXISTS "Users can only listen to own notification channels" ON realtime.messages;
CREATE POLICY "Users can only listen to own notification channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = ('notifications:' || auth.uid()::text)
  );

-- Fix 2: Tighten supervisor photo access to department-scoped only
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
      -- Supervisors can see photos of staff in their department (or all if OIC)
      OR EXISTS (
        SELECT 1 FROM public.profiles staff
        JOIN public.profiles supervisor ON supervisor.user_id = auth.uid()
        WHERE staff.photo_url = name
          AND has_role(auth.uid(), 'supervisor'::app_role)
          AND supervisor.department_id IS NOT NULL
          AND (
            supervisor.department_id = (SELECT id FROM public.departments WHERE name = 'OIC')
            OR supervisor.department_id = staff.department_id
          )
      )
    )
  );
