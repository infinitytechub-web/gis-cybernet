CREATE OR REPLACE FUNCTION public.presence_identities(_user_ids uuid[])
 RETURNS TABLE(user_id uuid, staff_id text, first_name text, last_name text, department text, rank text, photo_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_admin := has_role(v_uid, 'admin'::app_role);
  v_privileged := v_admin
    OR is_command_tier(v_uid)
    OR has_role(v_uid, 'supervisor'::app_role)
    OR is_shift_leader_tier(v_uid);

  RETURN QUERY
  SELECT p.user_id,
         p.staff_id,
         p.first_name,
         p.last_name,
         COALESCE(d.name, '') AS department,
         COALESCE(r.name, '') AS rank,
         p.photo_url
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  WHERE p.user_id = ANY(_user_ids)
    AND (
      p.user_id = v_uid
      OR v_admin
      OR (
        v_privileged
        AND p.org_unit_id IS NOT NULL
        AND public.has_org_access(v_uid, p.org_unit_id)
      )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.presence_identities(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_identities(uuid[]) TO authenticated;