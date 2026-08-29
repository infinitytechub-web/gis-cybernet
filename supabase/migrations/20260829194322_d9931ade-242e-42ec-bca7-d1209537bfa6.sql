ALTER TABLE public.attendance_edit_requests
  ADD CONSTRAINT attendance_edit_requests_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.misd_unit_assignments
  ADD CONSTRAINT misd_unit_assignments_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.shift_window_override_audit
  ADD CONSTRAINT shift_window_override_audit_shift_id_fkey
  FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;