GRANT EXECUTE ON FUNCTION public.can_manage_fleet(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fleet_process_position() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fleet_validate_geofence() FROM authenticated;