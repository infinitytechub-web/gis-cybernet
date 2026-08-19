GRANT SELECT, INSERT, UPDATE ON public.fleet_vehicles TO authenticated;
GRANT DELETE ON public.fleet_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_geofences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fleet_alerts TO authenticated;
GRANT SELECT ON public.fleet_positions TO authenticated;
GRANT SELECT ON public.fleet_geofence_events TO authenticated;
GRANT SELECT, INSERT ON public.fleet_fuel_readings TO authenticated;
GRANT SELECT ON public.fleet_ingest_keys TO authenticated;

GRANT ALL ON public.fleet_vehicles TO service_role;
GRANT ALL ON public.fleet_geofences TO service_role;
GRANT ALL ON public.fleet_alerts TO service_role;
GRANT ALL ON public.fleet_positions TO service_role;
GRANT ALL ON public.fleet_geofence_events TO service_role;
GRANT ALL ON public.fleet_fuel_readings TO service_role;
GRANT ALL ON public.fleet_ingest_keys TO service_role;