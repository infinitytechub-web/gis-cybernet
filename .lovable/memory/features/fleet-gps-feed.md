---
name: Fleet GPS feed onboarding
description: /fleet "GPS feed" tab — tracker key minting (show-once, hashed) and per-vehicle feed readiness driving dashboard charts
type: feature
---

# Fleet GPS feed onboarding

- Tab: `src/components/fleet/FleetGpsFeedTab.tsx`, hooks in `src/hooks/useFleetFeed.ts`, mounted in `src/pages/Fleet.tsx` (`gps-feed`, command/fleet-manage only; minting/revoking is admin-only).
- Ingest endpoint: `POST {VITE_SUPABASE_URL}/functions/v1/fleet-ingest` with `x-fleet-key` header, body `{ positions: [...] }` (batch up to 500). Accepts `device_id` or `vehicle_id`, `lat`, `lng`, `recorded_at`, `speed_kph`, `heading`, `ignition`, `odometer_km`, `fuel_level_pct`, `satellites`.
- Keys: `fleet_create_ingest_key(_label, _vehicle_id)` returns plaintext ONCE; only a SHA-256 hash is stored. `fleet_list_ingest_keys()` never returns the hash. `fleet_set_ingest_key_active(_id, _active)` revokes/reactivates. Vehicle-scoped keys reject positions for other vehicles.
- Readiness: `fleet_feed_readiness()` returns per-vehicle device/unit/driver, last position, 24h fix + fuel counts, 7d geofence events and a `feed_state` of no_device | no_key | never_reported | live | stale | silent.
- Onboarding order for empty dashboard charts: register vehicle with tracker device ID + unit + driver → mint key → point device at endpoint → readiness flips to Live and uptime/fuel/geofence charts populate.
- Verified live: 12 positions posted for TRK-2101 (GS-2101-26) → readiness Live, dashboard distance 33 km / 1 reporting.
