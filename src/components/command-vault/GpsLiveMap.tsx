import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GpsLiveMapProps {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
}

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Single-point live map with light/dark tiles + Google/Street View links in popup. */
export function GpsLiveMap({ lat, lng, label, height = 360 }: GpsLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    }

    const dark = isDarkMode();
    const map = L.map(containerRef.current, { zoomControl: true }).setView([lat, lng], 16);
    mapRef.current = map;

    L.tileLayer(
      dark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ).addTo(map);

    const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

    const marker = L.circleMarker([lat, lng], {
      radius: 10,
      color: dark ? "#334155" : "#fff",
      fillColor: "#2563eb",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    marker.bindPopup(`
      <div style="font-size:12px;min-width:200px">
        <p style="font-weight:600;margin:0 0 4px">${label ?? "GPS Address"}</p>
        <p style="margin:0;color:#666">📐 ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
          <a href="${sv}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#1a73e8;color:#fff;text-decoration:none">🚶 Street View</a>
          <a href="${gmaps}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#0f9d58;color:#fff;text-decoration:none">📍 Google Maps</a>
          <a href="${osm}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#7e57c2;color:#fff;text-decoration:none">🗺️ OSM</a>
        </div>
      </div>
    `).openPopup();

    return () => {
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, [lat, lng, label]);

  return <div ref={containerRef} style={{ height }} className="w-full rounded-md overflow-hidden border" />;
}

export default GpsLiveMap;
