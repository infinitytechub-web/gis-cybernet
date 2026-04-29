DROP POLICY IF EXISTS "Stores roles can read inventory-audit reports" ON storage.objects;
CREATE POLICY "Stores roles can read inventory-audit reports"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reports'
    AND name LIKE 'inventory-audit/%'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'oic')
      OR public.has_role(auth.uid(),'2ic')
      OR public.has_role(auth.uid(),'storekeeper')
      OR public.has_role(auth.uid(),'procurement_officer')
    )
  );