import L from "leaflet";
import { createGoogleLayer } from "./google-tile-layer";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adds a Google-Maps-powered Streets / Satellite / Hybrid / Terrain base-layer
 * switcher to a Leaflet map. Tiles are fetched via the maps-tile-proxy edge
 * function (auth-gated, server-side API key). The previous OSM / Esri layers
 * remain available under "Streets (OSM)" / "Satellite (Esri)" as a no-key
 * fallback so the map still works if the proxy is unreachable.
 *
 * Returns the initially-active base layer (already added to the map).
 */
export function addBaseLayerSwitcher(
  map: L.Map,
  opts: {
    dark?: boolean;
    defaultLayer?: "Streets" | "Satellite" | "Hybrid" | "Terrain";
    surface?: string; // for audit log
  } = {},
) {
  const dark = !!opts.dark;
  const def = opts.defaultLayer ?? "Streets";
  const surface = opts.surface ?? "map";

  // Google (proxied, authenticated)
  const gStreets = createGoogleLayer("streets");
  const gSatellite = createGoogleLayer("satellite");
  const gHybrid = createGoogleLayer("hybrid");
  const gTerrain = createGoogleLayer("terrain");

  // Fallbacks (no key)
  const osmStreets = L.tileLayer(
    dark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" },
  );
  const esriSat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Tiles &copy; Esri" },
  );
  const opentopo = L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    { maxZoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" },
  );

  const baseLayers: Record<string, L.Layer> = {
    Streets: gStreets,
    Satellite: gSatellite,
    Hybrid: gHybrid,
    Terrain: gTerrain,
    "Streets (OSM)": osmStreets,
    "Satellite (Esri)": esriSat,
    "Terrain (OTM)": opentopo,
  };

  const initial = baseLayers[def] ?? gStreets;
  initial.addTo(map);

  const layersControl = L.control.layers(baseLayers, undefined, { position: "topright", collapsed: true }).addTo(map);

  // Audit access (best-effort, fire-and-forget)
  const logAccess = (view: string) => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("map_access_audit").insert({
          user_id: data.user.id,
          surface,
          view_mode: view,
        }).then(() => {}, () => {});
      }
    });
  };
  logAccess(def);
  map.on("baselayerchange", (e: L.LayersControlEvent) => logAccess(e.name));

  // ── Automatic tile failover ──────────────────────────────────────────────
  // Each Google view has an ordered chain of no-key alternatives. When the
  // active source fails (proxy unreachable, Map Tiles API disabled, or repeated
  // tile errors) the next source in the chain is swapped in automatically. The
  // chain keeps advancing, so the map always ends up on a working provider.
  const googleLayers = new Map<L.Layer, string>([
    [gStreets, "streets"],
    [gSatellite, "satellite"],
    [gHybrid, "hybrid"],
    [gTerrain, "terrain"],
  ]);

  const chains: Record<string, { name: string; layer: L.Layer }[]> = {
    streets: [
      { name: "Streets (OSM)", layer: osmStreets },
      { name: "Terrain (OTM)", layer: opentopo },
      { name: "Satellite (Esri)", layer: esriSat },
    ],
    satellite: [
      { name: "Satellite (Esri)", layer: esriSat },
      { name: "Streets (OSM)", layer: osmStreets },
    ],
    hybrid: [
      { name: "Satellite (Esri)", layer: esriSat },
      { name: "Streets (OSM)", layer: osmStreets },
    ],
    terrain: [
      { name: "Terrain (OTM)", layer: opentopo },
      { name: "Streets (OSM)", layer: osmStreets },
    ],
  };

  // Which chain we are currently walking, and how far along.
  let chainKey = googleLayers.get(initial) ?? "streets";
  let chainIndex = -1; // -1 = still on the Google source
  let switching = false;

  const notify = (from: string, to: string) => {
    logAccess(`${to} [auto-failover]`);
    try {
      window.dispatchEvent(new CustomEvent("map-tiles-failover", { detail: { from, to } }));
      // Legacy event kept so existing banners keep working.
      window.dispatchEvent(new CustomEvent("google-tiles-fallback-applied", { detail: { to } }));
    } catch { /* ignore */ }
  };

  const advance = (fromName: string) => {
    if (switching) return;
    const chain = chains[chainKey] ?? chains.streets;
    const next = chain[chainIndex + 1];
    if (!next) return; // exhausted — keep whatever is showing
    switching = true;
    chainIndex += 1;
    // Remove every base layer, then add the next candidate.
    Object.values(baseLayers).forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
    next.layer.addTo(map);
    notify(fromName, next.name);
    setTimeout(() => { switching = false; }, 1500);
  };

  const onGoogleFailed = () => {
    let activeGoogle: L.Layer | null = null;
    googleLayers.forEach((_view, l) => { if (map.hasLayer(l)) activeGoogle = l; });
    if (!activeGoogle) return;
    chainKey = googleLayers.get(activeGoogle) ?? "streets";
    chainIndex = -1;
    advance("Google");
  };
  window.addEventListener("google-tiles-failed", onGoogleFailed);

  // Fallback providers can fail too — count tile errors and advance.
  let errorCount = 0;
  let errorWindowStart = Date.now();
  map.on("tileerror", () => {
    if (Date.now() - errorWindowStart > 10_000) { errorCount = 0; errorWindowStart = Date.now(); }
    errorCount += 1;
    if (errorCount >= 6) {
      errorCount = 0;
      const chain = chains[chainKey] ?? chains.streets;
      const current = chain[chainIndex];
      if (current && map.hasLayer(current.layer)) advance(current.name);
    }
  });

  // Manual selection resets the failover state for the newly chosen source.
  map.on("baselayerchange", (e: L.LayersControlEvent) => {
    if (switching) return;
    const view = googleLayers.get(e.layer as L.Layer);
    chainKey = view ?? "streets";
    chainIndex = view ? -1 : (chains[chainKey] ?? []).findIndex((c) => c.layer === e.layer);
    errorCount = 0;
  });

  map.on("unload", () => window.removeEventListener("google-tiles-failed", onGoogleFailed));

  return initial;
}
