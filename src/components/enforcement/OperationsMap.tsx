import React, { useEffect, useRef, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { format } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  "amasaman": [5.7000, -0.2833],
  "pokuase": [5.7167, -0.2833],
  "ofankor": [5.6667, -0.2667],
  "achimota": [5.6167, -0.2333],
  "dome": [5.6500, -0.2333],
  "haatso": [5.6667, -0.2000],
  "taifa": [5.6667, -0.2500],
  "kwabenya": [5.7000, -0.2167],
  "ashongman": [5.7000, -0.2000],
  "legon": [5.6500, -0.1833],
  "circle": [5.5667, -0.2167],
  "accra": [5.6037, -0.1870],
  "tema": [5.6698, -0.0166],
  "kasoa": [5.5333, -0.4167],
  "nsawam": [5.8000, -0.3500],
  "adenta": [5.7167, -0.1667],
  "madina": [5.6833, -0.1667],
  "pantang": [5.7167, -0.1833],
  "aburi": [5.8500, -0.1750],
  "dodowa": [5.8833, -0.0833],
  "weija": [5.5667, -0.3333],
  "mallam": [5.5833, -0.2667],
  "bortianor": [5.5500, -0.3667],
};

function parseCoordinatesFromLocation(location: string): [number, number] | null {
  const coordMatch = location.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (coordMatch) return [parseFloat(coordMatch[1]), parseFloat(coordMatch[2])];
  const lower = location.toLowerCase().trim();
  for (const [name, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(name)) return coords;
  }
  return null;
}

type Operation = {
  id: string;
  operation_type: string;
  operation_date: string;
  location: string | null;
  severity: string;
  suspects_count: number;
  arrests_count: number;
  status: string;
  description: string | null;
};

interface OperationsMapProps {
  operations: Operation[];
}

type BaseLayerKey = "streets" | "satellite" | "hybrid" | "terrain";

const BASE_LAYERS: Record<BaseLayerKey, { label: string; light: string; dark?: string; attribution: string; maxZoom: number; overlay?: string }> = {
  streets: {
    label: "Streets",
    light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    label: "Satellite",
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  hybrid: {
    label: "Hybrid",
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlay: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Imagery &copy; Esri, Maxar &mdash; Labels &copy; Esri',
    maxZoom: 19,
  },
  terrain: {
    label: "Terrain",
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom',
    maxZoom: 19,
  },
};

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

export default function OperationsMap({ operations }: OperationsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [clusterEnabled, setClusterEnabled] = useState(true);

  const allSeverities = useMemo(() => {
    const s = new Set(operations.map(op => op.severity));
    return Array.from(s).sort();
  }, [operations]);

  const allTypes = useMemo(() => {
    const t = new Set(operations.map(op => op.operation_type));
    return Array.from(t).sort();
  }, [operations]);

  const [activeSeverities, setActiveSeverities] = useState<Set<string>>(new Set(allSeverities));
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(allTypes));

  useEffect(() => { setActiveSeverities(new Set(allSeverities)); }, [allSeverities]);
  useEffect(() => { setActiveTypes(new Set(allTypes)); }, [allTypes]);

  const toggleSeverity = (s: string) => {
    setActiveSeverities(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const toggleType = (t: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const mappableOps = useMemo(() => {
    return operations
      .filter(op => op.location && activeSeverities.has(op.severity) && activeTypes.has(op.operation_type))
      .map(op => {
        const coords = parseCoordinatesFromLocation(op.location!);
        if (!coords) return null;
        const jitter = () => (Math.random() - 0.5) * 0.002;
        return { ...op, lat: coords[0] + jitter(), lng: coords[1] + jitter() };
      })
      .filter(Boolean) as (Operation & { lat: number; lng: number })[];
  }, [operations, activeSeverities, activeTypes]);

  const center: [number, number] = useMemo(() => {
    if (mappableOps.length === 0) return [5.7000, -0.2833]; // Default: Amasaman
    const avgLat = mappableOps.reduce((s, o) => s + o.lat, 0) / mappableOps.length;
    const avgLng = mappableOps.reduce((s, o) => s + o.lng, 0) / mappableOps.length;
    return [avgLat, avgLng];
  }, [mappableOps]);

  const [darkMode, setDarkMode] = useState(isDarkMode);
  useEffect(() => {
    const obs = new MutationObserver(() => setDarkMode(isDarkMode()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch { /* ignore */ }
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, { zoomAnimation: true }).setView(center, 12);
    mapInstanceRef.current = map;

    L.tileLayer(darkMode ? DARK_TILES : LIGHT_TILES, {
      attribution: darkMode
        ? '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers: L.CircleMarker[] = [];
    mappableOps.forEach(op => {
      const color = SEVERITY_COLORS[op.severity] || "#3b82f6";
      const radius = 8 + Math.min(op.arrests_count * 2, 12);

      const marker = L.circleMarker([op.lat, op.lng], {
        radius,
        fillColor: color,
        color: darkMode ? "#334155" : "#fff",
        weight: 2,
        fillOpacity: 0.85,
      });

      marker.bindPopup(`
        <div style="font-size:12px;min-width:160px">
          <p style="font-weight:bold;text-transform:capitalize;margin:0 0 4px">${op.operation_type.replace(/_/g, " ")}</p>
          <p style="margin:0;color:#666">${format(new Date(op.operation_date), "dd MMM yyyy")}</p>
          <p style="margin:2px 0;color:#666">${op.location}</p>
          <p style="margin:4px 0"><strong>${op.suspects_count}</strong> suspects · <strong style="color:#dc2626">${op.arrests_count}</strong> arrests</p>
          <p style="margin:4px 0">
            <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;background:${color}22;color:${color};text-transform:capitalize">${op.severity}</span>
            <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;background:#e5e7eb;margin-left:4px;text-transform:capitalize">${op.status.replace(/_/g, " ")}</span>
          </p>
          ${op.description ? `<p style="margin:4px 0;color:#888;font-size:11px">${op.description}</p>` : ""}
        </div>
      `);

      markers.push(marker);
    });

    if (clusterEnabled && markers.length > 0) {
      const clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster: any) => {
          const count = cluster.getChildCount();
          const size = count < 5 ? 36 : count < 15 ? 44 : 52;
          return L.divIcon({
            html: `<div style="
              background:hsl(var(--primary));
              color:#fff;
              width:${size}px;height:${size}px;
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              font-weight:700;font-size:13px;
              border:3px solid ${darkMode ? '#1e293b' : '#fff'};
              box-shadow:0 2px 8px rgba(0,0,0,.3);
            ">${count}</div>`,
            className: "",
            iconSize: L.point(size, size),
          });
        },
      });
      markers.forEach(m => clusterGroup.addLayer(m));
      map.addLayer(clusterGroup);
    } else {
      markers.forEach(m => m.addTo(map));
    }

    if (mappableOps.length > 1) {
      const bounds = L.latLngBounds(mappableOps.map(o => [o.lat, o.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "leaflet-legend");
      const bg = darkMode ? "rgba(30,41,59,0.92)" : "rgba(255,255,255,0.92)";
      const textColor = darkMode ? "#e2e8f0" : "#1e293b";
      div.innerHTML = `
        <div style="background:${bg};color:${textColor};padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.3)">
          <div style="font-weight:600;margin-bottom:4px">Severity</div>
          ${Object.entries(SEVERITY_COLORS).map(([label, color]) =>
            `<div style="display:flex;align-items:center;gap:6px">
              <span style="width:12px;height:12px;border-radius:50%;background:${color};display:inline-block;border:1px solid ${darkMode ? '#334155' : '#fff'};box-shadow:0 0 2px rgba(0,0,0,.3)"></span>
              <span style="text-transform:capitalize">${label}</span>
            </div>`
          ).join("")}
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    return () => {
      try { map.remove(); } catch { /* ignore */ }
      mapInstanceRef.current = null;
    };
  }, [mappableOps, center, darkMode, clusterEnabled]);

  const noGeoOps = operations.filter(op => op.location).length === 0;

  if (noGeoOps) {
    return (
      <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
        No geo-located operations to display. Use "Get GPS Address" when recording operations.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-muted-foreground mr-1">Severity:</span>
          {Object.entries(SEVERITY_COLORS).map(([sev, color]) => {
            const active = activeSeverities.has(sev);
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs capitalize transition-all cursor-pointer ${
                  active ? "border-transparent" : "opacity-40 border-border line-through"
                }`}
                style={active ? { background: `${color}22`, color, borderColor: color } : {}}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {sev}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-muted-foreground mr-1">Type:</span>
          {allTypes.map(t => {
            const active = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`px-2 py-0.5 rounded-full border text-xs capitalize transition-all cursor-pointer ${
                  active
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "opacity-40 border-border line-through text-muted-foreground"
                }`}
              >
                {t.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setClusterEnabled(prev => !prev)}
          className={`ml-auto px-2.5 py-0.5 rounded-full border text-xs transition-all cursor-pointer ${
            clusterEnabled
              ? "bg-primary/10 text-primary border-primary/30"
              : "opacity-60 border-border text-muted-foreground"
          }`}
        >
          {clusterEnabled ? "⊕ Clustered" : "⊙ Individual"}
        </button>
      </div>

      {mappableOps.length === 0 ? (
        <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm border rounded-md">
          No operations match the selected filters.
        </div>
      ) : (
        <div ref={mapRef} className="h-[350px] rounded-md overflow-hidden border" />
      )}
    </div>
  );
}
