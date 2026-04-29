-- Schema additions
ALTER TABLE public.enforcement_operations
  ADD COLUMN IF NOT EXISTS mugshot_path text,
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS mugshot_path text,
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Storage bucket for mugshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('enforcement-photos', 'enforcement-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to view (RLS on parent rows already restricts who knows the path)
DROP POLICY IF EXISTS "Authenticated can view enforcement photos" ON storage.objects;
CREATE POLICY "Authenticated can view enforcement photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'enforcement-photos');

-- Only enforcement-tier roles may upload
DROP POLICY IF EXISTS "Enforcement tier can upload mugshots" ON storage.objects;
CREATE POLICY "Enforcement tier can upload mugshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'enforcement-photos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'oic'::app_role)
      OR public.has_role(auth.uid(), '2ic'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
      OR public.has_role(auth.uid(), 'shift_supervisor'::app_role)
      OR public.has_role(auth.uid(), 'deputy_shift_supervisor'::app_role)
    )
  );

DROP POLICY IF EXISTS "Enforcement tier can update mugshots" ON storage.objects;
CREATE POLICY "Enforcement tier can update mugshots"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'enforcement-photos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'oic'::app_role)
      OR public.has_role(auth.uid(), '2ic'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

DROP POLICY IF EXISTS "Enforcement tier can delete mugshots" ON storage.objects;
CREATE POLICY "Enforcement tier can delete mugshots"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'enforcement-photos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'oic'::app_role)
      OR public.has_role(auth.uid(), '2ic'::app_role)
    )
  );