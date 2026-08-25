DROP POLICY IF EXISTS "Owners read secure-uploads" ON storage.objects;
CREATE POLICY "Owners read secure-uploads"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'secure-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.can_manage_command_tier(auth.uid())
  )
);