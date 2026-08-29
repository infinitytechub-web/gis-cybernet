# Map provider switcher with sticky preference

Today the failover between Google, OSM, Esri and OpenTopo happens silently inside the Leaflet layers control, and the choice is forgotten as soon as the page reloads — so every map screen tries Google again, gets the 404, and flickers back to a backup. This adds a visible provider control and remembers what actually worked.

## What the user sees

- A small **Map provider** selector sits on top of every map (Fleet live map, GPS live map) next to the existing status banner: Auto (recommended), Google, OSM, Esri Satellite, OpenTopo.
- **Auto** is the default: it uses Google when Google is healthy and drops to OSM (streets/terrain views) or Esri (satellite/hybrid views) the moment Google returns 404 / a fallback tile.
- When Auto demotes Google, the selector shows the provider in use ("Auto — OSM") and the banner keeps explaining why.
- The demotion is remembered: after Google has failed, later visits and reloads start directly on the backup provider instead of retrying Google and flashing blank tiles. The preference expires after 6 hours so restored Google access is picked up again.
- Choosing a provider explicitly pins it — no automatic switching until the user returns to Auto.

## Technical notes

New module `src/lib/map-provider-preference.ts`
- localStorage-backed store: `{ mode: "auto" | "google" | "osm" | "esri" | "opentopo", googleFailedAt?: number }` under key `cybernet.map.provider`.
- `getProviderPreference()`, `setProviderMode(mode)`, `markGoogleFailed()`, `googleRecentlyFailed()` (6h TTL), plus a `subscribe()` callback list so the switcher UI and the map stay in sync across surfaces.

`src/lib/leaflet-base-layers.ts`
- `addBaseLayerSwitcher` reads the preference at init: if mode is pinned, add that layer; if mode is auto and `googleRecentlyFailed()`, start on the OSM/Esri equivalent of the requested `defaultLayer` instead of the Google layer.
- `onGoogleFailed` calls `markGoogleFailed()` before advancing the chain (existing chain logic unchanged).
- Existing `baselayerchange` handler also records the manual pick via `setProviderMode`, so the Leaflet control and the new selector stay consistent.
- Return an object/handle exposing `applyProvider(mode)` so the React selector can drive the map; keep the current return value for existing call sites (no signature break).

`src/components/maps/MapProviderSwitcher.tsx` (new)
- shadcn `Select` styled with existing tokens, subscribes to the preference store, shows the effective provider label, calls back into the map handle.

`src/components/fleet/FleetLiveMap.tsx`, `src/components/command-vault/GpsLiveMap.tsx`
- Keep the handle from `addBaseLayerSwitcher` in a ref and render `<MapProviderSwitcher />` alongside `<MapTilesStatusBanner />`.

No database, RLS or edge function changes; `maps-tile-proxy` behaviour stays as is.
