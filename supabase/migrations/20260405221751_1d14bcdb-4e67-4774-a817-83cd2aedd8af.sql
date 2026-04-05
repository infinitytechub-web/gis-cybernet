CREATE OR REPLACE FUNCTION public.is_supervisor_for_profile(_user_id uuid, _profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS supervisor
    JOIN public.profiles AS staff ON staff.id = _profile_id
    WHERE supervisor.user_id = _user_id
      AND public.has_role(_user_id, 'supervisor')
      AND staff.user_id IS DISTINCT FROM _user_id
      AND (
        supervisor.department_id IS NOT NULL
        AND (
          supervisor.department_id = (SELECT id FROM departments WHERE name = 'OIC')
          OR supervisor.department_id = staff.department_id
        )
      )
  )
$$;