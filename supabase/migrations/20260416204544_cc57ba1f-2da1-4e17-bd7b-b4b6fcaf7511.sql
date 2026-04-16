CREATE OR REPLACE FUNCTION public.get_email_by_staff_id(_staff_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE p.staff_id = _staff_id
     OR lower(split_part(u.email, '@', 1)) = lower(_staff_id)
     OR lower(u.email) = lower(_staff_id)
  ORDER BY (p.staff_id = _staff_id) DESC
  LIMIT 1;
$function$;