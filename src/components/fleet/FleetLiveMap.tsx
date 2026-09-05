/**
 * Live fleet map — vehicle markers (colour-coded by motion state), geofence
 * overlays and an optional historical track for the focused vehicle.
 * Tiles come from the shared server-proxied base-layer switcher.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addBaseLayerSwitcher } from "@/lib/leaflet-base-layers";
import { MapTilesStatusBanner } from "@/components/maps/MapTilesStatusBanner";
import { MapProviderSwitcher } from "@/components/maps/MapProviderSwitcher";
import { formatDateTime } from "@/lib/date-format";
import {
  FLEET_DEFAULT_CENTER,
  MOTION_HEX,
  MOTION_LABELS,
  motionState,
  parsePolygon,
  vehicleLabel,
  type FleetGeofence,
  type FleetPosition,
  type FleetVehicle,
} from "@/lib/fleet";

interface FleetLiveMapProps {
  vehicles: FleetVehicle[];
  geofences?: FleetGeofence[];
  track?: FleetPosition[];
  focusVehicleId?: string | null;
  height?: number;
  onSelectVehicle?: (vehicleId: string) => void;
}

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function vehicleIcon(vehicle: FleetVehicle, focused: boolean) {
  const state = motionState(vehicle);
  const colour = MOTION_HEX[state];
  const heading = Number(vehicle.last_heading ?? 0);
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `
      <div style="position:relative;width:26px;height:26px">
        <div style="position:absolute;inset:0;border-radius:9999px;background:${colour};opacity:${focused ? 0.35 : 0.18}"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(${heading}deg);
          width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
          border-bottom:14px solid ${colour};filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))"></div>
      </div>`,
  });
}

function popupHtml(vehicle: FleetVehicle) {
  const state = motionState(vehicle);
  const seen = vehicle.last_seen_at ? formatDateTime(vehicle.last_seen_at) : "never";
  const rows: Array<[string, string]> = [
    ["Status", MOTION_LABELS[state]],
    ["Speed", vehicle.last_speed_kph != null ? `${Math.round(Number(vehicle.last_speed_kph))} km/h` : "—"],
    ["Fuel", vehicle.last_fuel_level_pct != null ? `${Math.round(Number(vehicle.last_fuel_level_pct))}%` : "—"],
    ["Odometer", `${Math.round(Number(vehicle.odometer_km ?? 0)).toLocaleString()} km`],
    ["Last report", seen],
  ];
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  return `
    <div style="min-width:190px">
      <strong>${esc(vehicleLabel(vehicle))}</strong>
      <table style="margin-top:6px;font-size:12px">
        ${rows.map(([k, v]) => `<tr><td style="padding-right:8px;opacity:.7">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}
      </table>
    </div>`;
}

export function FleetLiveMap({
  vehicles,
  geofences = [],
  track = [],
  focusVehicleId = null,
  height = 460,
  onSelectVehicle,
}: FleetLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const fenceLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(FLEET_DEFAULT_CENTER, 11);
    mapRef.current = map;
    addBaseLayerSwitcher(map, { dark: isDarkMode(), defaultLayer: "Streets" });
    fenceLayerRef.current = L.layerGroup().addTo(map);
    trackLayerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Geofence overlays
  useEffect(() => {
    const layer = fenceLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const fence of geofences) {
      if (!fence.active) continue;
      const style = { color: "hsl(35 92% 42%)", weight: 2, fillOpacity: 0.08 };
      if (fence.kind === "circle" && fence.center_lat != null && fence.center_lng != null) {
        L.circle([fence.center_lat, fence.center_lng], { radius: Number(fence.radius_m ?? 0), ...style })
          .bindTooltip(fence.name)
          .addTo(layer);
      } else {
        const pts = parsePolygon(fence.polygon);
        if (pts.length >= 3) L.polygon(pts, style).bindTooltip(fence.name).addTo(layer);
      }
    }
  }, [geofences]);

  // Vehicle markers (created once, then moved so the map does not flicker)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    for (const vehicle of vehicles) {
      if (vehicle.last_lat == null || vehicle.last_lng == null) continue;
      seen.add(vehicle.id);
      const latlng: L.LatLngExpression = [vehicle.last_lat, vehicle.last_lng];
      const focused = focusVehicleId === vehicle.id;
      let marker = markersRef.current.get(vehicle.id);
      if (!marker) {
        marker = L.marker(latlng, { icon: vehicleIcon(vehicle, focused), title: vehicleLabel(vehicle) }).addTo(map);
        marker.bindPopup(popupHtml(vehicle));
        marker.on("click", () => onSelectVehicle?.(vehicle.id));
        markersRef.current.set(vehicle.id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(vehicleIcon(vehicle, focused));
        marker.setPopupContent(popupHtml(vehicle));
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (!fittedRef.current && seen.size > 0) {
      const bounds = L.latLngBounds(
        vehicles
          .filter((v) => v.last_lat != null && v.last_lng != null)
          .map((v) => [v.last_lat as number, v.last_lng as number] as [number, number]),
      );
      map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [vehicles, focusVehicleId, onSelectVehicle]);

  // Historical track for the focused vehicle
  useEffect(() => {
    const map = mapRef.current;
    const layer = trackLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = track
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length < 2) return;
    L.polyline(pts, { color: "hsl(217 91% 45%)", weight: 3, opacity: 0.85 }).addTo(layer);
    L.circleMarker(pts[0], { radius: 5, color: "hsl(142 72% 32%)", fillOpacity: 1 })
      .bindTooltip("Track start").addTo(layer);
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
  }, [track]);

  // Recentre when a vehicle is selected from the list
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusVehicleId) return;
    const vehicle = vehicles.find((v) => v.id === focusVehicleId);
    if (!vehicle?.last_lat || !vehicle?.last_lng) return;
    map.panTo([vehicle.last_lat, vehicle.last_lng]);
    markersRef.current.get(focusVehicleId)?.openPopup();
  }, [focusVehicleId, vehicles]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end">
        <MapProviderSwitcher />
      </div>
      <MapTilesStatusBanner />
      <div className="relative overflow-hidden rounded-lg border border-border">
        <div ref={containerRef} style={{ height }} aria-label="Live fleet map" role="application" />
      </div>
    </div>
  );
}
