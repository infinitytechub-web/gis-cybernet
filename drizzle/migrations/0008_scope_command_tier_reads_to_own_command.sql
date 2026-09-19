DROP POLICY IF EXISTS "Command tier can read command transfers" ON public.command_transfers;

CREATE POLICY "Command tier can read command transfers in scope"
ON public.command_transfers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = command_transfers.profile_id
      AND (
        p.user_id = auth.uid()
        OR (
          is_command_tier(auth.uid())
          AND p.org_unit_id IS NOT NULL
          AND has_org_access(auth.uid(), p.org_unit_id)
        )
      )
  )
);

DROP POLICY IF EXISTS "Command tier reads staff access log" ON public.staff_access_log;

CREATE POLICY "Command tier reads staff access log in scope"
ON public.staff_access_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    is_command_tier(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = staff_access_log.target_profile_id
        AND p.org_unit_id IS NOT NULL
        AND has_org_access(auth.uid(), p.org_unit_id)
    )
  )
);

DROP POLICY IF EXISTS "Command tier can view all roles" ON public.user_roles;

CREATE POLICY "Command tier can view roles in scope"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    is_command_tier(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.org_unit_id IS NOT NULL
        AND has_org_access(auth.uid(), p.org_unit_id)
    )
  )
);