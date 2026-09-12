DROP POLICY IF EXISTS "Command tier views scoped leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Command tier updates scoped leave requests" ON public.leave_requests;

CREATE POLICY "Command tier views scoped leave requests"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  public.is_command_tier(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = leave_requests.profile_id
      AND p.org_unit_id IS NOT NULL
      AND public.can_view_org_unit(auth.uid(), p.org_unit_id)
  )
);

CREATE POLICY "Command tier updates scoped leave requests"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  public.is_command_tier(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = leave_requests.profile_id
      AND p.org_unit_id IS NOT NULL
      AND public.can_view_org_unit(auth.uid(), p.org_unit_id)
  )
)
WITH CHECK (
  public.is_command_tier(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = leave_requests.profile_id
      AND p.org_unit_id IS NOT NULL
      AND public.can_view_org_unit(auth.uid(), p.org_unit_id)
  )
);