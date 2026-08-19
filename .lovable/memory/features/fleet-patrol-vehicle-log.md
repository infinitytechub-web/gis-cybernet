---
name: Patrol vehicle log (Fleet Dashboard)
description: Fleet Dashboard "Record vehicle" dialog captures a patrol's vehicle, odometer out/in and fuel used
type: feature
---
Fleet Dashboard → Submitted patrol logs has a "Record / Update vehicle" action per patrol
(gated by RBAC `fleet`; RLS is the real gate). `src/components/fleet/PatrolVehicleLogDialog.tsx`
writes `vehicle_id`, `odometer_start_km`, `odometer_end_km`, `fuel_used_litres` through
`useUpdatePatrolLog`, so the `patrol_log_vehicle_usage` trigger still validates readings and
pushes `fleet_vehicles.odometer_km` forward. Selecting "Foot patrol" clears all four columns.
Dialog shows live distance and km/L; blocks negative values and closing < opening readings.
Verified live: PTL-20260819-0001 → DEMO-GS-0001, 48,200 → 48,310.5 km, 14.2 L, 7.78 km/L.
