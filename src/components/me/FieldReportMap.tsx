/**
 * Field-report GIS map for the M&E Command Center.
 *
 * Locations come from the me_field_report_map RPC (scoped by classification and
 * unit visibility) so the client never selects the reports table directly.
 * Markers are clustered, coloured by report status, clickable for details, and
 * mirrored by a keyboard-reachable list. Region roll-ups filter the map and the
 * surrounding dashboard figures.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { MapPin, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addBaseLayerSwitcher } from "@/lib/leaflet-base-layers";
import { MapProviderSwitcher } from "@/components/maps/MapProviderSwitcher";
import { MapTilesStatusBanner } from "@/components/maps/MapTilesStatusBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date-format";
import { toast } from "sonner";

const db = supabase as any;
const GHANA_CENTER: [number, number] = [7.95, -1.03];

export type FieldReportPoint = {
  id: string;
  ref_code?: string | null;
  title?: string | null;
  summary?: string | null;
  report_type?: string | null;
  status?: string | null;
  region?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reported_at?: string | null;
  project_id?: string | null;
};

type RegionRow = { region: string; total: number; located: number };

/** Status → semantic token driving both the marker and the badge. */
const STATUS_TOKEN: Record<string, string> = {
  draft: "--muted-foreground",
  submitted: "--primary",
  under_review: "--accent-foreground",
  returned: "--destructive",
  verified: "--primary",
  approved: "--primary",
};

const STATUS_LEGEND: Array<{ key: string; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "returned", label: "Returned" },
  { key: "verified", label: "Verified" },
];

function titleCase(value: unknown) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tokenColour(status?: string | null) {
  const token = STATUS_TOKEN[String(status ?? "").toLowerCase()] ?? "--muted-foreground";
  return `hsl(var(${token}))`;
}

function reportIcon(report: FieldReportPoint, selected: boolean) {
  const colour = tokenColour(report.status);
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${colour};opacity:${selected ? 1 : 0.85};
      border:2px solid hsl(var(--background));box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
  });
}

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function FieldReportMap({
  region,
  onRegionChange,
  height = 420,
}: {
  region: string;
  onRegionChange: (region: string) => void;
  height?: number;
}) {
  const [reports, setReports] = useState<FieldReportPoint[]>([]);
  const [byRegion, setByRegion] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const load = async () => {
    setLoading(true);
    const { data, error } = await db.rpc("me_field_report_map", { _region: region.trim() || null });
    if (error) {
      toast.error(error.message);
      setReports([]);
      setByRegion([]);
    } else {
      setReports(Array.isArray(data?.reports) ? data.reports : []);
      setByRegion(Array.isArray(data?.by_region) ? data.by_region : []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [region]);

  const located = useMemo(
    () => reports.filter((report) => Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))),
    [reports],
  );
  const unlocated = useMemo(() => reports.filter((report) => !located.includes(report)), [reports, located]);
  const selected = useMemo(() => reports.find((report) => report.id === selectedId) ?? null, [reports, selectedId]);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(GHANA_CENTER, 7);
    addBaseLayerSwitcher(map, { dark: isDarkMode(), defaultLayer: "Streets", surface: "me-field-reports" });
    const cluster = new (L as any).MarkerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
    cluster.addTo(map);
    mapRef.current = map;
    clusterRef.current = cluster;
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Re-render markers whenever the located set changes.
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();
    located.forEach((report) => {
      const marker = L.marker([Number(report.latitude), Number(report.longitude)], {
        icon: reportIcon(report, report.id === selectedId),
        title: report.title ?? report.ref_code ?? "Field report",
      });
      marker.on("click", () => setSelectedId(report.id));
      markersRef.current.set(report.id, marker);
      cluster.addLayer(marker);
    });
    if (located.length) {
      map.fitBounds(L.latLngBounds(located.map((r) => [Number(r.latitude), Number(r.longitude)] as [number, number])).pad(0.25), { maxZoom: 12 });
    } else {
      map.setView(GHANA_CENTER, 7);
    }
  }, [located, selectedId]);

  const focus = (report: FieldReportPoint) => {
    setSelectedId(report.id);
    const map = mapRef.current;
    if (map && Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))) {
      map.setView([Number(report.latitude), Number(report.longitude)], 12);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Field reports by location</CardTitle>
        <div className="flex items-center gap-2">
          <MapProviderSwitcher />
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh field report map"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MapTilesStatusBanner />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-border">
              <div ref={containerRef} style={{ height }} role="application" aria-label="Map of field reports" />
              {loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground" role="status">Loading field report locations…</div>}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {STATUS_LEGEND.map((item) => (
                <span key={item.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tokenColour(item.key) }} aria-hidden />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Reports per region</p>
              {byRegion.length === 0 ? (
                <p className="text-sm text-muted-foreground">No field reports recorded yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {byRegion.map((row) => (
                    <Button
                      key={row.region}
                      size="sm"
                      variant={region.trim() === row.region ? "default" : "outline"}
                      onClick={() => onRegionChange(region.trim() === row.region ? "" : row.region)}
                    >
                      {row.region} <span className="ml-1.5 tabular-nums opacity-80">{row.total}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Located reports</p>
              {located.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reports with coordinates in this scope.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {located.map((report) => (
                    <li key={report.id}>
                      <button
                        type="button"
                        onClick={() => focus(report)}
                        className={`w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring ${selectedId === report.id ? "border-primary bg-muted" : "border-transparent"}`}
                      >
                        <span className="block truncate font-medium">{report.title ?? report.ref_code}</span>
                        <span className="block truncate text-xs text-muted-foreground">{report.region ?? "—"} · {titleCase(report.status)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{selected.title ?? selected.ref_code}</p>
                  <Badge variant="secondary">{titleCase(selected.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{selected.ref_code} · {titleCase(selected.report_type) || "Field report"}</p>
                {selected.summary && <p className="mt-2 text-sm">{selected.summary}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Region</dt><dd className="font-medium">{selected.region ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">District</dt><dd className="font-medium">{selected.district ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Reported</dt><dd className="font-medium">{formatDate(selected.reported_at)}</dd></div>
                  <div><dt className="text-muted-foreground">Coordinates</dt><dd className="font-medium tabular-nums">{Number(selected.latitude).toFixed(4)}, {Number(selected.longitude).toFixed(4)}</dd></div>
                </dl>
                <a href={`/me/field-reports?record=${selected.id}`} className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Open full report</a>
              </div>
            )}

            {unlocated.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Location not recorded ({unlocated.length})</p>
                <ul className="max-h-28 space-y-1 overflow-y-auto pr-1 text-sm text-muted-foreground">
                  {unlocated.map((report) => (
                    <li key={report.id} className="truncate">{report.title ?? report.ref_code} · {titleCase(report.status)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
