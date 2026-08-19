REVOKE EXECUTE ON FUNCTION public.org_unit_descendants(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_unit_ancestors(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_org_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_org_unit(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_staff_profile(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_org_unit_cycle() FROM anon, authenticated;