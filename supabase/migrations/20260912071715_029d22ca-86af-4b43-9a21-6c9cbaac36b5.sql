CREATE OR REPLACE FUNCTION public.my_leave_balances(_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
RETURNS TABLE(
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  department_name text,
  unit text,
  shift_group text,
  leave_type public.leave_type,
  days_entitled numeric,
  days_taken numeric,
  days_pending numeric,
  days_remaining numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT b.*
  FROM public.leave_balances(_year) b
  JOIN public.profiles p ON p.id = b.profile_id
  WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_leave_balances(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_leave_balances(integer) TO authenticated, service_role;