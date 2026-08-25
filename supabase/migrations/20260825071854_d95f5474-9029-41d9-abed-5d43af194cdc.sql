DELETE FROM public.leave_requests lr
USING public.profiles p
WHERE p.id = lr.profile_id
  AND p.staff_id IN ('ADMIN-001','GIS-ADMIN-001');