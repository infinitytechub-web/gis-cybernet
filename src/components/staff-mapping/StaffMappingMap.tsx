/**
 * Staff mapping map — plots staff counts per posting location.
 *
 * Coordinates come from the staff_mapping_rows RPC (org-unit coordinates with a
 * regional-capital fallback), so the client never selects profiles directly.
 * Clicking a marker filters the surrounding dashboard by that location.
 */
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { addBaseLayerSwitcher } from "@/lib/leaflet-base-layers";
import { MapProviderSwitcher } from "@/components/maps/MapProviderSwitcher";
import { MapTilesStatusBanner } from "@/components/maps/MapTilesStatusBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GHANA_CENTER: [number, number] = [7.95, -1.03];

export type MapCluster = {
  key: string;
  label: string;
  region: string;
  latitude: number;
  longitude: number;
  count: number;
};

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function clusterIcon(cluster: MapCluster, selected: boolean, max: number) {
  const size = Math.round(26 + Math.min(1, cluster.count / Math.max(max, 1)) * 22);
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;
      justify-content:center;font-size:11px;font-weight:700;color:hsl(var(--primary-foreground));
      background:hsl(var(--primary));opacity:${selected ? 1 : 0.85};border:2px solid hsl(var(--background));
      box-shadow:0 1px 4px rgba(0,0,0,.35)">${cluster.count}</div>`,
  });
}

export function StaffMappingMap({
  clusters,
  selectedKey,
  onSelect,
  unlocatedCount,
  height = 380,
}: {
  clusters: MapCluster[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  unlocatedCount: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const max = useMemo(() => clusters.reduce((acc, c) => Math.max(acc, c.count), 0), [clusters]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(GHANA_CENTER, 7);
    addBaseLayerSwitcher(map, { dark: isDarkMode(), defaultLayer: "Streets", surface: "staff-mapping" });
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    clusters.forEach((cluster) => {
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: clusterIcon(cluster, cluster.key === selectedKey, max),
        title: `${cluster.label} — ${cluster.count} staff`,
      });
      marker.bindTooltip(`${cluster.label}: ${cluster.count}`, { direction: "top" });
      marker.on("click", () => onSelect(cluster.key === selectedKey ? null : cluster.key));
      layer.addLayer(marker);
    });
    if (clusters.length) {
      map.fitBounds(
        L.latLngBounds(clusters.map((c) => [c.latitude, c.longitude] as [number, number])).pad(0.35),
        { maxZoom: 11 },
      );
    } else {
      map.setView(GHANA_CENTER, 7);
    }
  }, [clusters, selectedKey, max, onSelect]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Staff by location
        </CardTitle>
        <MapProviderSwitcher />
      </CardHeader>
      <CardContent className="space-y-3">
        <MapTilesStatusBanner />
        <div className="overflow-hidden rounded-lg border border-border">
          <div ref={containerRef} style={{ height }} role="application" aria-label="Map of staff postings" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{clusters.length} mapped location{clusters.length === 1 ? "" : "s"}</span>
          {unlocatedCount > 0 && <span>{unlocatedCount} staff without a mapped location</span>}
          {selectedKey && (
            <button type="button" onClick={() => onSelect(null)} className="font-medium text-primary underline-offset-4 hover:underline">
              Clear location filter
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
