
-- Supervisors can view postings/transfers from their department
CREATE POLICY "Supervisors can view department postings"
ON public.postings_transfers
FOR SELECT
TO authenticated
USING (public.is_supervisor_for_profile(auth.uid(), profile_id));

-- Supervisors can update (approve/reject) postings/transfers from their department
CREATE POLICY "Supervisors can update department postings"
ON public.postings_transfers
FOR UPDATE
TO authenticated
USING (public.is_supervisor_for_profile(auth.uid(), profile_id))
WITH CHECK (public.is_supervisor_for_profile(auth.uid(), profile_id));
