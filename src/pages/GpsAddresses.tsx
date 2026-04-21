import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MapPin, Search, Lock, Activity, Globe2, Crosshair, Package, Shield,
  ExternalLink, Radio, Navigation as NavIcon, Sparkles, Cloud, Copy, Check, Loader2, Timer,
} from "lucide-react";
import { ExportMenu } from "@/components/ui/export-menu";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { GpsLiveMap } from "@/components/command-vault/GpsLiveMap";

type SourceKey = "operations" | "enforcement_operations" | "cyber_incidents" | "inventory_items";

const SOURCE_META: Record<SourceKey, { label: string; icon: any; color: string; chartColor: string }> = {
  operations: {
    label: "Operations",
    icon: Crosshair,
    color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
    chartColor: "hsl(25, 90%, 55%)",
  },
  enforcement_operations: {
    label: "Enforcement",
    icon: Shield,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    chartColor: "hsl(0, 80%, 55%)",
  },
  cyber_incidents: {
    label: "Cyber Incidents",
    icon: Radio,
    color: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    chartColor: "hsl(270, 70%, 60%)",
  },
  inventory_items: {
    label: "Inventory",
    icon: Package,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    chartColor: "hsl(40, 85%, 55%)",
  },
};

interface GpsRecord {
  id: string;
  source: SourceKey;
  raw_location: string;
  digital_address: string | null;
  lat: number | null;
  lng: number | null;
  context: string;
  reference: string;
  created_at: string;
  status?: string | null;
}

// Re-uses the canonical KNOWN_LOCATIONS map from OperationsMap to derive coords
// from landmark-style addresses (Amasaman, Pokuase, etc.).
const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  amasaman: [5.7, -0.2833],
  pokuase: [5.7167, -0.2833],
  ofankor: [5.6667, -0.2667],
  achimota: [5.6167, -0.2333],
  dome: [5.65, -0.2333],
  haatso: [5.6667, -0.2],
  taifa: [5.6667, -0.25],
  kwabenya: [5.7, -0.2167],
  ashongman: [5.7, -0.2],
  legon: [5.65, -0.1833],
  circle: [5.5667, -0.2167],
  accra: [5.6037, -0.187],
  tema: [5.6698, -0.0166],
  kasoa: [5.5333, -0.4167],
  nsawam: [5.8, -0.35],
  adenta: [5.7167, -0.1667],
  madina: [5.6833, -0.1667],
  pantang: [5.7167, -0.1833],
  aburi: [5.85, -0.175],
  dodowa: [5.8833, -0.0833],
  weija: [5.5667, -0.3333],
  mallam: [5.5833, -0.2667],
  bortianor: [5.55, -0.3667],
};

// "GA-123-4567" → rough centroid by hashing the digits to a small jitter around Greater Accra.
function digitalAddressToCoords(addr: string): [number, number] | null {
  const m = /^([A-Z]{2})-(\d{3})-(\d{4})$/.exec(addr);
  if (!m) return null;
  const region = m[1];
  const a = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  // Region-based approximate centroid (very rough — UI labels this as approximate).
  const base: Record<string, [number, number]> = {
    GA: [5.65, -0.2],   // Greater Accra
    AK: [6.7, -1.6],    // Ashanti
    GS: [5.0, -1.7],    // Western
  };
  const [bLat, bLng] = base[region] ?? [5.65, -0.2];
  const lat = bLat + ((a % 100) - 50) * 0.002;
  const lng = bLng + ((b % 1000) - 500) * 0.0008;
  return [lat, lng];
}

function parseLocation(raw: string): { lat: number | null; lng: number | null; digital: string | null; approximate: boolean } {
  if (!raw) return { lat: null, lng: null, digital: null, approximate: false };
  // Coords explicit "(lat, lng)"
  const coordMatch = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  const digitalMatch = raw.match(/^([A-Z]{2}-\d{3}-\d{4})/);
  const digital = digitalMatch ? digitalMatch[1] : null;
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]), digital, approximate: false };
  }
  if (digital) {
    const c = digitalAddressToCoords(digital);
    if (c) return { lat: c[0], lng: c[1], digital, approximate: true };
  }
  const lower = raw.toLowerCase();
  for (const [name, c] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(name)) return { lat: c[0], lng: c[1], digital, approximate: true };
  }
  return { lat: null, lng: null, digital, approximate: false };
}

export default function GpsAddresses() {
  const { isAdmin, isOic, is2ic, role, loading } = useAuth();
  const allowed = isAdmin || isOic || is2ic || role === "staff_officer";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceKey | "all">("all");
  const [selected, setSelected] = useState<GpsRecord | null>(null);

  // Realtime: invalidate on changes to any of the source tables
  useEffect(() => {
    if (!allowed) return;
    const channel = supabase.channel("gps-addresses-rt");
    (["operations", "enforcement_operations", "cyber_incidents", "inventory_items"] as const).forEach((t) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["gps-addresses"] });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowed, qc]);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["gps-addresses"],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async (): Promise<GpsRecord[]> => {
      const [ops, enf, cyber, inv] = await Promise.all([
        supabase
          .from("operations")
          .select("id, location, operation_type, operation_date, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("enforcement_operations")
          .select("id, location, operation_type, operation_date, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("cyber_incidents")
          .select("id, location, incident_number, incident_type, severity, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("inventory_items")
          .select("id, location, name, sku, qty_on_hand, unit, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const out: GpsRecord[] = [];
      for (const r of (ops.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "operations", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: r.operation_type?.replace(/_/g, " ") ?? "Operation",
          reference: r.id.slice(0, 8), created_at: r.created_at, status: r.status,
        });
      }
      for (const r of (enf.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "enforcement_operations", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: r.operation_type?.replace(/_/g, " ") ?? "Enforcement",
          reference: r.id.slice(0, 8), created_at: r.created_at, status: r.status,
        });
      }
      for (const r of (cyber.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "cyber_incidents", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: `${r.incident_number} — ${r.incident_type}`,
          reference: r.incident_number, created_at: r.created_at, status: r.severity,
        });
      }
      for (const r of (inv.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "inventory_items", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: `${r.name} (${r.qty_on_hand} ${r.unit})`,
          reference: r.sku ?? r.id.slice(0, 8), created_at: r.created_at,
          status: r.qty_on_hand > 0 ? "in_stock" : "out_of_stock",
        });
      }
      return out;
    },
  });

  const filtered = useMemo(() => {
    let list = records;
    if (sourceFilter !== "all") list = list.filter((r) => r.source === sourceFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        `${r.raw_location} ${r.digital_address ?? ""} ${r.context} ${r.reference}`.toLowerCase().includes(s),
      );
    }
    return list;
  }, [records, search, sourceFilter]);

  // Keep the open dialog's record in sync with realtime updates so the live map
  // and coordinate readouts reflect the latest data without manual reopen.
  useEffect(() => {
    if (!selected) return;
    const fresh = records.find((r) => r.source === selected.source && r.id === selected.id);
    if (fresh && (fresh.lat !== selected.lat || fresh.lng !== selected.lng || fresh.raw_location !== selected.raw_location)) {
      setSelected(fresh);
    }
  }, [records, selected]);

  // Pulse indicator: highlight analytics card when a new GPS record is inserted.
  const [pulse, setPulse] = useState(false);
  const totalRef = useRef<number>(records.length);
  useEffect(() => {
    if (records.length > totalRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2500);
      totalRef.current = records.length;
      return () => clearTimeout(t);
    }
    totalRef.current = records.length;
  }, [records.length]);

  const buildExport = () => {
    const headers = ["GPS Address", "Digital", "Latitude", "Longitude", "Source", "Context", "Reference", "Status", "Captured"];
    const rows = filtered.map((r) => [
      r.raw_location ?? "",
      r.digital_address ?? "",
      r.lat != null ? r.lat.toFixed(6) : "",
      r.lng != null ? r.lng.toFixed(6) : "",
      SOURCE_META[r.source].label,
      r.context ?? "",
      r.reference ?? "",
      r.status ?? "",
      format(new Date(r.created_at), "dd MMM yyyy, HH:mm"),
    ]);
    const filterParts: string[] = [];
    if (sourceFilter !== "all") filterParts.push(`Source: ${SOURCE_META[sourceFilter as SourceKey].label}`);
    if (search.trim()) filterParts.push(`Search: "${search.trim()}"`);
    const subtitle = `Command Vault · ${filtered.length} of ${records.length} GPS records${filterParts.length ? ` · ${filterParts.join(" · ")}` : ""}`;
    return {
      title: "GPS Address Register",
      filename: `gps_addresses_${format(new Date(), "yyyyMMdd_HHmm")}`,
      headers,
      rows,
      subtitle,
    };
  };

  // ===== Cloud export (S3-style storage + time-limited signed URL) =====
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudResult, setCloudResult] = useState<{
    url: string;
    filename: string;
    expires_at: string;
    expires_in: number;
    record_count: number;
  } | null>(null);
  const [cloudCopied, setCloudCopied] = useState(false);
  const [linkTtl, setLinkTtl] = useState<string>("3600");
  const [cloudCountdown, setCloudCountdown] = useState<string>("");

  useEffect(() => {
    if (!cloudResult) { setCloudCountdown(""); return; }
    const tick = () => {
      const ms = new Date(cloudResult.expires_at).getTime() - Date.now();
      if (ms <= 0) { setCloudCountdown("expired"); return; }
      const mins = Math.floor(ms / 60_000);
      const secs = Math.floor((ms % 60_000) / 1000);
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      setCloudCountdown(hrs > 0 ? `${hrs}h ${remMins}m` : `${mins}m ${secs.toString().padStart(2, "0")}s`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cloudResult]);

  const csvEscape = (val: string) => {
    if (val == null) return "";
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildCsv = () => {
    const exp = buildExport();
    const lines = [exp.headers.map(csvEscape).join(",")];
    for (const row of exp.rows) lines.push(row.map(csvEscape).join(","));
    return { csv: lines.join("\n"), filename: `${exp.filename}.csv`, subtitle: exp.subtitle };
  };

  const runCloudExport = async () => {
    if (filtered.length === 0) return;
    setCloudBusy(true);
    setCloudResult(null);
    setCloudCopied(false);
    try {
      const { csv, filename, subtitle } = buildCsv();
      const expiresIn = Number(linkTtl) || 3600;
      const { data, error } = await supabase.functions.invoke("gps-cloud-export", {
        body: { csv, filename, expiresIn, recordCount: filtered.length, filtersSummary: subtitle },
      });
      if (error) throw error;
      const payload = data as { url: string; filename: string; expires_at: string; expires_in: number };
      if (!payload?.url) throw new Error("No signed URL returned");
      setCloudResult({
        url: payload.url,
        filename: payload.filename,
        expires_at: payload.expires_at,
        expires_in: payload.expires_in,
        record_count: filtered.length,
      });
      toast({ title: "Uploaded to cloud", description: `Signed link valid for ${formatTtl(payload.expires_in)}.` });
    } catch (e: any) {
      toast({ title: "Cloud export failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setCloudBusy(false);
    }
  };

  const copyCloudLink = async () => {
    if (!cloudResult) return;
    try {
      await navigator.clipboard.writeText(cloudResult.url);
      setCloudCopied(true);
      window.setTimeout(() => setCloudCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the link manually.", variant: "destructive" });
    }
  };

  const stats = useMemo(() => {
    const total = records.length;
    const mappable = records.filter((r) => r.lat != null && r.lng != null).length;
    const digital = records.filter((r) => r.digital_address).length;
    const sourceBreakdown = (Object.keys(SOURCE_META) as SourceKey[]).map((key) => ({
      key,
      label: SOURCE_META[key].label,
      count: records.filter((r) => r.source === key).length,
      color: SOURCE_META[key].chartColor,
    }));
    // Region tally from digital prefix
    const regionCounts = new Map<string, number>();
    records.forEach((r) => {
      if (r.digital_address) {
        const region = r.digital_address.slice(0, 2);
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
    });
    const topRegions = Array.from(regionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([region, count]) => ({ region, count }));

    // Last 7 days timeline
    const series: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const count = records.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      series.push({ label: format(d, "EEE"), count });
    }

    const lastCapture = records.length > 0
      ? records.reduce((acc, r) => (new Date(r.created_at) > new Date(acc) ? r.created_at : acc), records[0].created_at)
      : null;

    return { total, mappable, digital, sourceBreakdown, topRegions, series, lastCapture };
  }, [records]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary">GPS Address Dashboard</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Restricted — Admin, OIC, 2IC, Staff Officer · Live across Operations, Enforcement, Cyber, Inventory
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <MapPin className="h-3 w-3" /> {records.length} GPS record{records.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {/* ===== Realtime analytics ===== */}
      <Card className={`border-primary/20 transition-shadow ${pulse ? "shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className={`h-5 w-5 text-primary ${pulse ? "animate-pulse" : ""}`} />
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                Realtime Analytics
                {pulse && (
                  <Badge variant="secondary" className="gap-1 text-[10px] bg-primary/10 text-primary">
                    <Sparkles className="h-3 w-3" /> New record
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Auto-refreshes on database changes · Last capture {stats.lastCapture ? formatDistanceToNow(new Date(stats.lastCapture), { addSuffix: true }) : "—"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={<MapPin className="h-4 w-4" />} label="Total GPS Records" value={stats.total} tone="primary" />
            <KpiTile icon={<NavIcon className="h-4 w-4" />} label="Mappable" value={stats.mappable} sub={`${stats.total ? Math.round((stats.mappable / stats.total) * 100) : 0}% have coords`} tone="emerald" />
            <KpiTile icon={<Crosshair className="h-4 w-4" />} label="Digital Addresses" value={stats.digital} sub="Ghana Post format" tone="violet" />
            <KpiTile icon={<Globe2 className="h-4 w-4" />} label="Active Sources" value={stats.sourceBreakdown.filter((s) => s.count > 0).length} sub="of 4 modules" tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 7-day capture trend */}
            <div className="lg:col-span-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Captures — Last 7 Days</h3>
                <Badge variant="outline" className="text-[10px]">By day</Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Source breakdown */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">By Source Module</h3>
                <Badge variant="outline" className="text-[10px]">Live</Badge>
              </div>
              {stats.sourceBreakdown.every((s) => s.count === 0) ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No GPS data yet</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.sourceBreakdown.filter((s) => s.count > 0)}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {stats.sourceBreakdown.filter((s) => s.count > 0).map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <ReTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Region tally */}
          {stats.topRegions.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Top Regions (by digital prefix)</h3>
                <Badge variant="outline" className="text-[10px]">Top {stats.topRegions.length}</Badge>
              </div>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {stats.topRegions.map((r) => {
                  const pct = stats.digital > 0 ? Math.round((r.count / stats.digital) * 100) : 0;
                  return (
                    <li key={r.region} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold">{r.region}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.count} <span className="text-muted-foreground/70">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Address list ===== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg">All GPS Addresses</CardTitle>
              <CardDescription>Click any address to open coordinates and live map view.</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCloudOpen(true); setCloudResult(null); setCloudCopied(false); }}
                disabled={filtered.length === 0}
                className="gap-1.5"
              >
                <Cloud className="h-4 w-4" />
                Cloud export
              </Button>
              <ExportMenu
                getData={buildExport}
                label="Export GPS addresses"
                disabled={filtered.length === 0}
              />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap mt-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search address, digital code, context, reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(SOURCE_META) as SourceKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{SOURCE_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              {records.length === 0 ? "No GPS addresses captured yet." : "No records match the current filters."}
            </p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GPS Address</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="hidden md:table-cell">Context</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead className="hidden lg:table-cell">Captured</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = SOURCE_META[r.source];
                    const Icon = meta.icon;
                    const mappable = r.lat != null && r.lng != null;
                    return (
                      <TableRow
                        key={`${r.source}-${r.id}`}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <MapPin className={`h-4 w-4 mt-0.5 shrink-0 ${mappable ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="min-w-0">
                              <div className="font-medium font-mono text-xs truncate max-w-[260px]">{r.raw_location}</div>
                              {r.digital_address && (
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Digital: {r.digital_address}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={meta.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs capitalize">{r.context}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{r.reference}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                            disabled={!mappable && !r.digital_address}
                          >
                            <NavIcon className="h-4 w-4 mr-1" />
                            Track
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Live map dialog ===== */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NavIcon className="h-4 w-4 text-primary" />
              Live Map View
              <Badge variant="outline" className="text-[10px] gap-1 ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <InfoCell label="Address" value={selected.raw_location} mono />
                <InfoCell label="Digital" value={selected.digital_address ?? "—"} mono />
                <InfoCell
                  label="Latitude"
                  value={selected.lat != null ? selected.lat.toFixed(6) : "—"}
                  mono
                />
                <InfoCell
                  label="Longitude"
                  value={selected.lng != null ? selected.lng.toFixed(6) : "—"}
                  mono
                />
              </div>

              {selected.lat != null && selected.lng != null ? (
                <>
                  <GpsLiveMap
                    lat={selected.lat}
                    lng={selected.lng}
                    label={`${SOURCE_META[selected.source].label} — ${selected.context}`}
                    height={380}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selected.lat},${selected.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Street View
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Google Maps
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=18/${selected.lat}/${selected.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> OpenStreetMap
                      </a>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selected.raw_location.includes("(")
                      ? "Coordinates parsed directly from the captured GPS address."
                      : "Coordinates derived from the digital address / known landmark — approximate."}
                  </p>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  This record has no resolvable coordinates. Re-capture using "Get GPS Address" to enable live tracking.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Cloud export dialog ===== */}
      <Dialog open={cloudOpen} onOpenChange={(o) => { setCloudOpen(o); if (!o) { setCloudResult(null); setCloudCopied(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" />
              Export to Cloud Storage
              <Badge variant="outline" className="text-[10px] ml-1">S3-style · Signed URL</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Records to export</span>
                <span className="font-semibold tabular-nums">{filtered.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format</span>
                <span className="font-medium">CSV (UTF-8)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination</span>
                <span className="font-mono text-[11px]">command-vault/gps-exports/</span>
              </div>
            </div>

            {!cloudResult && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Link valid for</label>
                <Select value={linkTtl} onValueChange={setLinkTtl} disabled={cloudBusy}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="900">15 minutes</SelectItem>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="14400">4 hours</SelectItem>
                    <SelectItem value="86400">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  After uploading, a time-limited download link will be generated for command download.
                </p>
              </div>
            )}

            {cloudResult && (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Check className="h-4 w-4" />
                  Upload complete
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="font-mono truncate">{cloudResult.filename}</div>
                  <div className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Expires in <span className="font-semibold text-foreground">{cloudCountdown || "—"}</span>
                  </div>
                </div>
                <div className="flex items-stretch gap-1 mt-2">
                  <Input readOnly value={cloudResult.url} className="font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={copyCloudLink} className="shrink-0">
                    {cloudCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" asChild className="flex-1">
                    <a href={cloudResult.url} target="_blank" rel="noopener noreferrer" download={cloudResult.filename}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCloudOpen(false)} disabled={cloudBusy}>
                Close
              </Button>
              {!cloudResult ? (
                <Button onClick={runCloudExport} disabled={cloudBusy || filtered.length === 0}>
                  {cloudBusy ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                  ) : (
                    <><Cloud className="h-4 w-4 mr-1.5" /> Upload &amp; sign link</>
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => { setCloudResult(null); setCloudCopied(false); }}>
                  Generate another
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============= small helpers ============= */

function KpiTile({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone: "primary" | "emerald" | "violet" | "amber";
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`h-7 w-7 rounded-md flex items-center justify-center ${toneCls[tone]}`}>{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs ${mono ? "font-mono" : ""} truncate`}>{value}</div>
    </div>
  );
}
