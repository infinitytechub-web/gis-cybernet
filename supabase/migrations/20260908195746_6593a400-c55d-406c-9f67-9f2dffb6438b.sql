DROP POLICY IF EXISTS "Authorized officers can delete user roles" ON public.user_roles;

CREATE POLICY "Authorized officers can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  can_manage_command_tier(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (user_id <> auth.uid() AND role::text <> 'admin')
  )
);