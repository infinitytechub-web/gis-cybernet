
CREATE OR REPLACE FUNCTION public.kyc_access(_profile_ids uuid[])
RETURNS TABLE(profile_id uuid, full_access boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, COALESCE(r.level, -1) AS lvl
    FROM public.profiles p LEFT JOIN public.ranks r ON r.id = p.rank_id
    WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL LIMIT 1
  ), privileged AS (
    SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
        OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'head_of_administration') AS ok
  )
  SELECT t.id,
    (SELECT ok FROM privileged)
    OR t.id = (SELECT id FROM me)
    OR (public.has_profile_oversight_role(auth.uid())
        AND COALESCE((SELECT lvl FROM me), -1) > COALESCE(r.level, -1))
  FROM public.profiles t LEFT JOIN public.ranks r ON r.id = t.rank_id
  WHERE t.id = ANY(_profile_ids) AND public.can_access_staff_profile(auth.uid(), t.id);
$$;
REVOKE EXECUTE ON FUNCTION public.kyc_access(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.kyc_access(uuid[]) TO authenticated;
