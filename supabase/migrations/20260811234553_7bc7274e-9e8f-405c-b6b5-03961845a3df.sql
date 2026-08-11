REVOKE ALL ON FUNCTION public.can_manage_command_tier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.command_authority_level(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_command_capability(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_role_escalation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_bail_authorization() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_manage_command_tier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_authority_level(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_command_capability(uuid, text) TO authenticated, service_role;