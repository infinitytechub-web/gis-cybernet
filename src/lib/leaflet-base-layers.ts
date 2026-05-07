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

  // ── Auto-fallback: when Google tiles fail (e.g. Map Tiles API disabled),
  // swap the active Google layer for "Streets (OSM)". Only triggers once.
  const googleLayers = new Set<L.Layer>([gStreets, gSatellite, gHybrid, gTerrain]);
  let didFallback = false;
  const onGoogleFailed = () => {
    if (didFallback) return;
    let activeIsGoogle = false;
    googleLayers.forEach((l) => { if (map.hasLayer(l)) activeIsGoogle = true; });
    if (!activeIsGoogle) return;
    didFallback = true;
    googleLayers.forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
    osmStreets.addTo(map);
    logAccess("Streets (OSM) [auto-fallback]");
    try {
      window.dispatchEvent(new CustomEvent("google-tiles-fallback-applied"));
    } catch { /* ignore */ }
  };
  window.addEventListener("google-tiles-failed", onGoogleFailed);
  map.on("unload", () => window.removeEventListener("google-tiles-failed", onGoogleFailed));

  return initial;
}
