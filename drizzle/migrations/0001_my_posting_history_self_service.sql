CREATE OR REPLACE FUNCTION public.my_posting_history()
RETURNS TABLE(
  id uuid,
  from_unit_name text,
  to_unit_name text,
  from_level text,
  to_level text,
  from_shift_group text,
  to_shift_group text,
  reason text,
  effective_date date,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id,
         fu.name, tu.name,
         t.from_level, t.to_level,
         t.from_shift_group, t.to_shift_group,
         t.reason, t.effective_date, t.created_at
  FROM public.command_transfers t
  JOIN public.profiles p ON p.id = t.profile_id
  LEFT JOIN public.org_units fu ON fu.id = t.from_org_unit_id
  LEFT JOIN public.org_units tu ON tu.id = t.to_org_unit_id
  WHERE auth.uid() IS NOT NULL
    AND p.user_id = auth.uid()
  ORDER BY t.effective_date DESC NULLS LAST, t.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.my_posting_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_posting_history() TO authenticated, service_role;