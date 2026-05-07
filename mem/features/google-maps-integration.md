---
name: Google Maps Integration
description: Server-proxied Google Maps tiles + RLS-locked route history table; integrated across all map surfaces
type: feature
---
- maps-tile-proxy edge function fetches Google 2D Tiles API server-side; GOOGLE_MAPS_API_KEY never reaches the browser. Auth-gated (Bearer JWT), per-user 600 tiles/min rate limit, session-token caching per view.
- src/lib/google-tile-layer.ts: Leaflet GridLayer subclass that fetches tiles via the proxy with the user's JWT (blob URLs, revoked on load).
- src/lib/leaflet-base-layers.ts now exposes Streets / Satellite / Hybrid / Terrain (Google) plus OSM/Esri fallbacks; logs view-mode changes to map_access_audit.
- route_tracking_history table: encrypted_route bytea, owner-only insert, owner+command-tier read, no update/delete.
- map_access_audit table: per-surface view-mode log, command-tier read.
