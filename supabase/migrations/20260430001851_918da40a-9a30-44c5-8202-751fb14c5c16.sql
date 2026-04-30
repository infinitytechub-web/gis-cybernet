-- Add file columns to certifications (parity with staff_documents)
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- Self-management RLS for certifications (mirrors staff_documents)
CREATE POLICY "Users insert own certifications"
  ON public.certifications FOR INSERT
  TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users update own certifications"
  ON public.certifications FOR UPDATE
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own certifications"
  ON public.certifications FOR DELETE
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));