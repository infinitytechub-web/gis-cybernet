import L from "leaflet";

/**
 * Adds a Streets / Satellite / Hybrid / Terrain base-layer switcher to a Leaflet map.
 * Returns the initially-active base layer (already added to the map).
 *
 *  - Streets: OpenStreetMap (or Carto Dark for dark mode)
 *  - Satellite: Esri World Imagery
 *  - Hybrid: Esri World Imagery + Esri reference labels overlay
 *  - Terrain: OpenTopoMap
 */
export function addBaseLayerSwitcher(
  map: L.Map,
  opts: { dark?: boolean; defaultLayer?: "Streets" | "Satellite" | "Hybrid" | "Terrain" } = {},
) {
  const dark = !!opts.dark;
  const def = opts.defaultLayer ?? "Streets";

  const streets = L.tileLayer(
    dark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' },
  );

  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics' },
  );

  const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: 'Labels &copy; Esri', pane: "overlayPane" },
  );

  const hybrid = L.layerGroup([
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' },
    ),
    labels,
  ]);

  const terrain = L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    { maxZoom: 17, attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)' },
  );

  const baseLayers: Record<string, L.Layer> = {
    Streets: streets,
    Satellite: satellite,
    Hybrid: hybrid,
    Terrain: terrain,
  };

  const initial = baseLayers[def];
  initial.addTo(map);

  L.control.layers(baseLayers, undefined, { position: "topright", collapsed: true }).addTo(map);

  return initial;
}
