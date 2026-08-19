REVOKE ALL ON FUNCTION public.block_procurement_event_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_procurement_event_mutation() TO service_role;
REVOKE ALL ON FUNCTION public.procurement_actor_name(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_procurement(uuid) FROM PUBLIC, anon;