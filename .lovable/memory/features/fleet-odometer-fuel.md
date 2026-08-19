---
name: Patrol odometer & fuel usage
description: patrol_logs odometer/fuel fields, fleet_vehicle_usage RPC and Fleet Dashboard usage card
type: feature
---
Patrol logs carry `odometer_start_km`, `odometer_end_km`, `fuel_used_litres` (optional, only when a vehicle is attached).
- Trigger `patrol_log_vehicle_usage` validates non-negative values, end >= start, requires a vehicle, and pushes `fleet_vehicles.odometer_km` forward (never backwards) to the end reading.
- RPC `fleet_vehicle_usage(_days)` (SECURITY DEFINER, authenticated only, scoped via `can_view_org_unit(auth.uid(), org_unit_id)`) returns per-vehicle patrol distance, patrol count, fuel used, refuel litres/cost, last reading and km/L.
- Fleet Dashboard: "Vehicle odometer log & fuel tracking" card + odometer/distance/fuel columns on the Submitted patrol logs card.
