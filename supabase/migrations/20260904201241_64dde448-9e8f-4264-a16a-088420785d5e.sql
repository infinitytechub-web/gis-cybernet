CREATE OR REPLACE FUNCTION public.get_email_by_staff_id(_staff_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT lower(btrim(_staff_id)) AS id_l,
           replace(replace(lower(btrim(_staff_id)), '-', ''), ' ', '') AS id_c
  )
  SELECT u.email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  CROSS JOIN norm
  WHERE lower(btrim(p.staff_id)) = norm.id_l
     OR replace(replace(lower(btrim(p.staff_id)), '-', ''), ' ', '') = norm.id_c
     OR lower(split_part(u.email, '@', 1)) = norm.id_l
     OR lower(u.email) = norm.id_l
  ORDER BY (lower(btrim(p.staff_id)) = norm.id_l) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_staff_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_staff_id(text) TO service_role;