
-- Function to check if a user is a supervisor for a given profile's department
CREATE OR REPLACE FUNCTION public.is_supervisor_for_profile(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS supervisor
    JOIN public.profiles AS staff ON staff.id = _profile_id
    WHERE supervisor.user_id = _user_id
      AND supervisor.department_id IS NOT NULL
      AND supervisor.department_id = staff.department_id
      AND public.has_role(_user_id, 'supervisor')
  )
$$;

-- Supervisors can view leave requests from their department
CREATE POLICY "Supervisors can view department leave requests"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (public.is_supervisor_for_profile(auth.uid(), profile_id));

-- Supervisors can update (approve/reject) leave requests from their department
CREATE POLICY "Supervisors can update department leave requests"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (public.is_supervisor_for_profile(auth.uid(), profile_id))
WITH CHECK (public.is_supervisor_for_profile(auth.uid(), profile_id));

-- Supervisors can view profiles in their department
CREATE POLICY "Supervisors can view department profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  department_id IN (
    SELECT p.department_id FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.department_id IS NOT NULL
  )
  AND public.has_role(auth.uid(), 'supervisor')
);
