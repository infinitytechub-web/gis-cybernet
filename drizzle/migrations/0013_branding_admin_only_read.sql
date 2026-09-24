DROP POLICY IF EXISTS "Public branding assets are readable" ON storage.objects;
CREATE POLICY "Admins can read branding assets" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::public.app_role));