-- Add supervisor SELECT policies to tables that are missing them

CREATE POLICY "Supervisors can view department attendance"
  ON public.attendances FOR SELECT TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), profile_id));

CREATE POLICY "Supervisors can view department shift assignments"
  ON public.shift_assignments FOR SELECT TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), profile_id));

CREATE POLICY "Supervisors can view department certifications"
  ON public.certifications FOR SELECT TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), profile_id));

CREATE POLICY "Supervisors can view department equipment"
  ON public.equipment_issuance FOR SELECT TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), profile_id));

CREATE POLICY "Supervisors can view department staff documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (is_supervisor_for_profile(auth.uid(), profile_id));