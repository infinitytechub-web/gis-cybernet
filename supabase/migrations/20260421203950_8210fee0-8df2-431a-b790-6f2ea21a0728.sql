-- Grant command tier (admin, oic, 2ic, staff_officer) read access to the
-- staff-photos storage bucket so they can view photos for staff they already
-- have profile-level access to. This aligns storage-level access with the
-- existing application-level RBAC.
CREATE POLICY "Command tier can view all staff photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'oic'::public.app_role)
    OR public.has_role(auth.uid(), '2ic'::public.app_role)
    OR public.has_role(auth.uid(), 'staff_officer'::public.app_role)
  )
);
