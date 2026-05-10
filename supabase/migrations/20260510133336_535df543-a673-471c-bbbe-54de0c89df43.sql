-- Extend read access on secure-uploads to processing staff who review applications
DROP POLICY IF EXISTS "Owners read secure-uploads" ON storage.objects;
CREATE POLICY "Owners read secure-uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'secure-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_command_tier(auth.uid())
    OR has_role(auth.uid(), 'front_desk'::app_role)
    OR has_role(auth.uid(), 'head_of_processing'::app_role)
    OR has_role(auth.uid(), 'deputy_head_of_processing'::app_role)
  )
);

-- Re-affirm upload policy: only authenticated users into their own folder
DROP POLICY IF EXISTS "Owners upload secure-uploads" ON storage.objects;
CREATE POLICY "Owners upload secure-uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'secure-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Re-affirm update policy (replace own files; admin can update any)
DROP POLICY IF EXISTS "Owners update own secure-uploads" ON storage.objects;
CREATE POLICY "Owners update own secure-uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'secure-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);