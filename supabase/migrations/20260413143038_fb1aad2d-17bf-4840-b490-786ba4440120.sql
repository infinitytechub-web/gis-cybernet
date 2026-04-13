CREATE OR REPLACE FUNCTION public.get_email_by_staff_id(_staff_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE p.staff_id = _staff_id
  LIMIT 1;
$$;