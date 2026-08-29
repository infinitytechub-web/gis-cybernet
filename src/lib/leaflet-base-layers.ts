import L from "leaflet";
import { createGoogleLayer } from "./google-tile-layer";
import { supabase } from "@/integrations/supabase/client";
import {
  getProviderMode,
  googleRecentlyFailed,
  markGoogleFailed,
  setProviderMode,
  subscribeProviderPreference,
  type MapProviderMode,
} from "./map-provider-preference";

/**
 * Adds a Google-Maps-powered Streets / Satellite / Hybrid / Terrain base-layer
 * switcher to a Leaflet map. Tiles are fetched via the maps-tile-proxy edge
 * function (auth-gated, server-side API key). The previous OSM / Esri layers
 * remain available under "Streets (OSM)" / "Satellite (Esri)" as a no-key
 * fallback so the map still works if the proxy is unreachable.
 *
 * The stored provider preference (see map-provider-preference) decides which
 * source is used first: a pinned provider always wins, and in Auto mode Google
 * is skipped while a recent Google failure is remembered.
 *
 * Returns a handle with the initially-active base layer plus `applyProvider`
 * so a UI control can drive the map.
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

  // Map a pinned provider mode onto a concrete layer name for the requested view.
  const nonGoogleNameFor = (mode: MapProviderMode): string | null => {
    if (mode === "osm") return "Streets (OSM)";
    if (mode === "esri") return "Satellite (Esri)";
    if (mode === "opentopo") return "Terrain (OTM)";
    return null;
  };
  // In Auto mode, the no-key equivalent of the requested Google view.
  const autoFallbackNameFor = (view: string): string =>
    view === "Satellite" || view === "Hybrid"
      ? "Satellite (Esri)"
      : view === "Terrain"
        ? "Terrain (OTM)"
        : "Streets (OSM)";

  const startMode = getProviderMode();
  let initialName = def as string;
  if (startMode === "google") {
    initialName = def;
  } else if (startMode !== "auto") {
    initialName = nonGoogleNameFor(startMode) ?? def;
  } else if (googleRecentlyFailed()) {
    initialName = autoFallbackNameFor(def);
  }

  const initial = baseLayers[initialName] ?? gStreets;
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
  logAccess(initialName);

  // Broadcast which concrete source is actually rendering, so the provider
  // switcher UI can show e.g. "Auto — OpenStreetMap".
  const announce = (name: string) => {
    try {
      window.dispatchEvent(new CustomEvent("map-provider-effective", { detail: { name } }));
    } catch { /* ignore */ }
  };
  announce(initialName);
  map.on("baselayerchange", (e: L.LayersControlEvent) => { logAccess(e.name); announce(e.name); });


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
  const viewChainKey = (name: string) =>
    name === "Satellite" ? "satellite" : name === "Hybrid" ? "hybrid" : name === "Terrain" ? "terrain" : "streets";
  let chainKey = googleLayers.get(initial) ?? viewChainKey(def);
  // -1 = still on the Google source; otherwise the index within the chain.
  let chainIndex = googleLayers.has(initial)
    ? -1
    : Math.max(-1, (chains[chainKey] ?? []).findIndex((c) => c.layer === initial));
  let switching = false;

  const notify = (from: string, to: string) => {
    logAccess(`${to} [auto-failover]`);
    announce(to);
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
    if (!next) {
      // Every source in the chain failed — tell the surface so it can show a
      // "base map unavailable" state. GPS tracking is unaffected.
      try { window.dispatchEvent(new CustomEvent("map-tiles-exhausted")); } catch { /* ignore */ }
      return;
    }
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
    // Remember the failure so later maps/reloads skip Google in Auto mode.
    markGoogleFailed();
    // A user who explicitly pinned Google stays on Google.
    if (getProviderMode() === "google") return;
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

  // Manual selection resets the failover state for the newly chosen source and
  // is remembered as a pinned provider preference.
  map.on("baselayerchange", (e: L.LayersControlEvent) => {
    if (switching) return;
    const view = googleLayers.get(e.layer as L.Layer);
    chainKey = view ?? viewChainKey(def);
    chainIndex = view ? -1 : (chains[chainKey] ?? []).findIndex((c) => c.layer === e.layer);
    errorCount = 0;
    if (!applyingPreference) {
      if (view) setProviderMode("google");
      else if (e.layer === osmStreets) setProviderMode("osm");
      else if (e.layer === esriSat) setProviderMode("esri");
      else if (e.layer === opentopo) setProviderMode("opentopo");
    }
  });

  // ── Provider switcher support ────────────────────────────────────────────
  let applyingPreference = false;

  /** Switches the map to the layer implied by a provider mode. */
  const applyProvider = (mode: MapProviderMode) => {
    const name =
      mode === "google"
        ? def
        : mode === "auto"
          ? (googleRecentlyFailed() ? autoFallbackNameFor(def) : def)
          : nonGoogleNameFor(mode) ?? def;
    const layer = baseLayers[name];
    if (!layer) return;
    applyingPreference = true;
    Object.values(baseLayers).forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
    layer.addTo(map);
    chainKey = googleLayers.get(layer) ?? viewChainKey(def);
    chainIndex = googleLayers.has(layer)
      ? -1
      : Math.max(-1, (chains[chainKey] ?? []).findIndex((c) => c.layer === layer));
    errorCount = 0;
    logAccess(name);
    announce(name);
    setTimeout(() => { applyingPreference = false; }, 0);
  };

  const unsubscribe = subscribeProviderPreference((pref) => applyProvider(pref.mode));

  map.on("unload", () => {
    window.removeEventListener("google-tiles-failed", onGoogleFailed);
    unsubscribe();
  });

  return { layer: initial, layersControl, applyProvider, dispose: unsubscribe };
}


/**
 * Attaches automatic tile failover to a map that manages its own base layer
 * (no layer-switcher control). Pass an ordered chain of candidate tile layers,
 * best first. The first candidate is added immediately; on repeated tile errors
 * the next candidate is swapped in. When every candidate fails, `onExhausted`
 * fires so the surface can show a "base map unavailable" state — markers and
 * live tracking keep working regardless.
 */
export function attachTileFailover(
  map: L.Map,
  candidates: { name: string; layer: L.Layer; overlay?: L.Layer }[],
  opts: { errorThreshold?: number; onSwitch?: (name: string) => void; onExhausted?: () => void } = {},
) {
  if (candidates.length === 0) return () => {};
  const threshold = opts.errorThreshold ?? 6;
  let index = 0;
  let switching = false;
  let errors = 0;
  let windowStart = Date.now();

  const show = (i: number) => {
    candidates.forEach(({ layer, overlay }) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (overlay && map.hasLayer(overlay)) map.removeLayer(overlay);
    });
    const c = candidates[i];
    c.layer.addTo(map);
    c.overlay?.addTo(map);
  };

  show(0);

  const onError = () => {
    if (switching) return;
    if (Date.now() - windowStart > 10_000) { errors = 0; windowStart = Date.now(); }
    errors += 1;
    if (errors < threshold) return;
    errors = 0;
    if (index >= candidates.length - 1) {
      opts.onExhausted?.();
      return;
    }
    switching = true;
    index += 1;
    show(index);
    opts.onSwitch?.(candidates[index].name);
    setTimeout(() => { switching = false; }, 1500);
  };

  map.on("tileerror", onError);
  return () => { map.off("tileerror", onError); };
}
