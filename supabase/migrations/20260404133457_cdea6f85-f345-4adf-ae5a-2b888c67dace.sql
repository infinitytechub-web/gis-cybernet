
-- Create a security definer function to get user's department_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_department_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT department_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Supervisors can view department profiles" ON public.profiles;

-- Recreate without self-referencing subquery
CREATE POLICY "Supervisors can view department profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND (
    department_id = get_user_department_id(auth.uid())
    OR get_user_department_id(auth.uid()) = (SELECT id FROM departments WHERE name = 'OIC')
  )
);
