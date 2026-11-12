CREATE OR REPLACE FUNCTION public.user_org_scope(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Super Admins (admin role) are global: every org unit is in scope.
  SELECT u.id FROM public.org_units u WHERE public.has_role(_user_id, 'admin'::public.app_role)
  UNION
  SELECT d FROM (
    SELECT p.org_unit_id AS id FROM public.profiles p
     WHERE p.user_id = _user_id AND p.org_unit_id IS NOT NULL
    UNION
    SELECT a.org_unit_id FROM public.org_unit_assignments a
     WHERE a.user_id = _user_id AND a.revoked_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
  ) r CROSS JOIN LATERAL public.org_unit_descendants(r.id) AS d;
$$;