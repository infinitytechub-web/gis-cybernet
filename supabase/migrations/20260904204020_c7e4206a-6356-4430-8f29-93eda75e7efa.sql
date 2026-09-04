REVOKE ALL ON FUNCTION public.biodata_can_view(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.biodata_can_edit(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.biodata_can_view_restricted(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.biodata_is_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.biodata_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.biodata_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.biodata_can_view_restricted(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.biodata_is_admin() TO authenticated, service_role;