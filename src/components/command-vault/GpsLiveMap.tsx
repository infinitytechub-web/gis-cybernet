import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addBaseLayerSwitcher } from "@/lib/leaflet-base-layers";
import { MapLegend } from "@/components/maps/MapLegend";

interface GpsLiveMapProps {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
}

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

// Inject pulse keyframes once.
const PULSE_STYLE_ID = "gps-live-marker-pulse-style";
function ensurePulseStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes gpsLiveMarkerPulse {
      0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.85; }
      80%  { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
      100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
    }
    .gps-live-marker-wrap {
      position: relative;
      width: 22px;
      height: 22px;
      pointer-events: none;
    }
    .gps-live-marker-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: hsl(217 91% 60%);
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.35);
      transition: transform .25s ease;
    }
    .dark .gps-live-marker-dot { border-color: #1e293b; }
    .gps-live-marker-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 18px;
      height: 18px;
      border-radius: 9999px;
      background: hsl(217 91% 60% / .55);
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0;
    }
    .gps-live-marker-ring.is-pulsing {
      animation: gpsLiveMarkerPulse 1.4s ease-out 2;
    }
    .gps-live-marker-dot.is-bumping {
      transform: translate(-50%, -50%) scale(1.35);
    }
  `;
  document.head.appendChild(style);
}

/** Single-point live map with light/dark tiles + Google/Street View links in popup.
 *  The marker is persisted across coordinate updates and animates (panTo + pulse)
 *  when its lat/lng changes due to a new GPS record being captured.
 */
export function GpsLiveMap({ lat, lng, label, height = 360 }: GpsLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Initialise map once (and on container/dark mode change implicitly via remount).
  useEffect(() => {
    ensurePulseStyle();
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialised

    const dark = isDarkMode();
    const map = L.map(containerRef.current, { zoomControl: true }).setView([lat, lng], 16);
    mapRef.current = map;

    addBaseLayerSwitcher(map, { dark, defaultLayer: "Streets" });

    // Build a custom DivIcon so we can target the dot/ring with CSS animations.
    const wrap = document.createElement("div");
    wrap.className = "gps-live-marker-wrap";
    const ring = document.createElement("div");
    ring.className = "gps-live-marker-ring";
    const dot = document.createElement("div");
    dot.className = "gps-live-marker-dot";
    wrap.appendChild(ring);
    wrap.appendChild(dot);
    dotRef.current = dot;
    ringRef.current = ring;

    const icon = L.divIcon({
      html: wrap.outerHTML,
      className: "gps-live-marker",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    markerRef.current = marker;
    lastCoordsRef.current = { lat, lng };

    // Re-grab live nodes (divIcon stringifies the HTML).
    const el = marker.getElement();
    if (el) {
      dotRef.current = el.querySelector<HTMLDivElement>(".gps-live-marker-dot");
      ringRef.current = el.querySelector<HTMLDivElement>(".gps-live-marker-ring");
    }

    return () => {
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
      markerRef.current = null;
      dotRef.current = null;
      ringRef.current = null;
      lastCoordsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update popup content whenever inputs change.
  useEffect(() => {
    if (!markerRef.current) return;
    const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
    markerRef.current.bindPopup(`
      <div style="font-size:12px;min-width:200px">
        <p style="font-weight:600;margin:0 0 4px">${label ?? "GPS Address"}</p>
        <p style="margin:0;color:#666">📐 ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
          <a href="${sv}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#1a73e8;color:#fff;text-decoration:none">🚶 Street View</a>
          <a href="${gmaps}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#0f9d58;color:#fff;text-decoration:none">📍 Google Maps</a>
          <a href="${osm}" target="_blank" rel="noopener" style="font-size:11px;padding:2px 6px;border-radius:4px;background:#7e57c2;color:#fff;text-decoration:none">🗺️ OSM</a>
        </div>
      </div>
    `);
  }, [lat, lng, label]);

  // Animate marker when coordinates change.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const prev = lastCoordsRef.current;
    const moved = !prev || prev.lat !== lat || prev.lng !== lng;
    if (!moved) return;

    // Smoothly pan and move the marker.
    marker.setLatLng([lat, lng]);
    map.panTo([lat, lng], { animate: true, duration: 0.6 });

    // Re-acquire DOM refs in case Leaflet replaced them after the icon update.
    const el = marker.getElement();
    if (el) {
      dotRef.current = el.querySelector<HTMLDivElement>(".gps-live-marker-dot");
      ringRef.current = el.querySelector<HTMLDivElement>(".gps-live-marker-ring");
    }

    // Skip the very first set (initial mount) — only animate on real updates.
    if (prev) {
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot) {
        dot.classList.remove("is-bumping");
        // force reflow so re-adding the class restarts the transition
        void dot.offsetWidth;
        dot.classList.add("is-bumping");
        window.setTimeout(() => dot.classList.remove("is-bumping"), 350);
      }
      if (ring) {
        ring.classList.remove("is-pulsing");
        void ring.offsetWidth;
        ring.classList.add("is-pulsing");
        window.setTimeout(() => ring.classList.remove("is-pulsing"), 2900);
      }
    }

    lastCoordsRef.current = { lat, lng };
  }, [lat, lng]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} style={{ height }} className="w-full rounded-md overflow-hidden border" />
      <MapLegend className="absolute bottom-2 left-2 z-[1000] max-w-[260px] hidden sm:block" />
    </div>
  );
}

export default GpsLiveMap;
