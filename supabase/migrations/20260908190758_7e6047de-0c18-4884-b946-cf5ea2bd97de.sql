REVOKE ALL ON FUNCTION public.can_directory_action(text, uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.my_directory_permissions() FROM anon, public;
REVOKE ALL ON FUNCTION public.directory_level_of_unit(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.directory_level_of_profile(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_directory_action(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_directory_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.directory_level_of_profile(uuid) TO authenticated;