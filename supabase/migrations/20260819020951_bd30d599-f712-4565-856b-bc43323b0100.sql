REVOKE ALL ON FUNCTION public.can_manage_fleet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_process_position() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_validate_geofence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_distance_m(double precision, double precision, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_point_in_polygon(double precision, double precision, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_geofence_contains(public.fleet_geofences, double precision, double precision) FROM PUBLIC, anon;