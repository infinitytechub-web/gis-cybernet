
-- Add file storage columns to staff_documents
ALTER TABLE public.staff_documents 
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- Storage bucket for staff documents (private)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('staff-documents', 'staff-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins manage all
CREATE POLICY "Admins manage staff document files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'staff-documents' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'staff-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Users view & upload their own document files (folder = their profile id)
CREATE POLICY "Users view own staff document files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users upload own staff document files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users delete own staff document files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'staff-documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Supervisors view department staff document files
CREATE POLICY "Supervisors view dept staff document files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND public.is_supervisor_for_profile(auth.uid(), p.id)
  )
);

-- Allow users to INSERT/UPDATE/DELETE their own staff_documents rows
CREATE POLICY "Users insert own staff documents"
ON public.staff_documents FOR INSERT TO authenticated
WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users update own staff documents"
ON public.staff_documents FOR UPDATE TO authenticated
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own staff documents"
ON public.staff_documents FOR DELETE TO authenticated
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
