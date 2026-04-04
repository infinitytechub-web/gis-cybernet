CREATE POLICY "Users can create own postings"
ON public.postings_transfers
FOR INSERT
TO authenticated
WITH CHECK (profile_id IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
));