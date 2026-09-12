DROP POLICY IF EXISTS "Command can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Command tier can update leave requests" ON public.leave_requests;

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
      AND public.can_see_org_unit(auth.uid(), p.org_unit_id)
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
      AND public.can_see_org_unit(auth.uid(), p.org_unit_id)
  )
)
WITH CHECK (
  public.is_command_tier(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = leave_requests.profile_id
      AND p.org_unit_id IS NOT NULL
      AND public.can_see_org_unit(auth.uid(), p.org_unit_id)
  )
);

CREATE OR REPLACE FUNCTION public.my_store_issuance()
RETURNS TABLE(
  id uuid,
  item_name text,
  unit text,
  quantity numeric,
  issued_at timestamptz,
  returned_at timestamptz,
  condition_on_return text,
  notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ii.id,
         i.name,
         i.unit,
         ii.quantity,
         ii.issued_at,
         ii.returned_at,
         ii.condition_on_return,
         ii.notes
  FROM public.inventory_issuance ii
  JOIN public.profiles p ON p.id = ii.profile_id
  JOIN public.inventory_items i ON i.id = ii.item_id
  WHERE p.user_id = auth.uid()
  ORDER BY ii.issued_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_store_issuance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_store_issuance() TO authenticated, service_role;