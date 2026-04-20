-- Remove the self-update policy so regular staff can no longer edit their own biodata
DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;

-- Replace the command-tier update policy to also include staff_officer
DROP POLICY IF EXISTS "Command tier can update profiles" ON public.profiles;

CREATE POLICY "Command tier can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);