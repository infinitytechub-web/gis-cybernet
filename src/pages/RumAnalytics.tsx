import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, AlertTriangle, Activity, RefreshCw, TrendingDown, Download, Printer } from "lucide-react";

function downloadCsv(filename: string, rows: (string | number)[][], preamble: string[][] = []) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const all = [...preamble, ...(preamble.length ? [[""]] : []), ...rows];
  const csv = all.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { format, subHours } from "date-fns";

type RumEvent = {
  id: number;
  created_at: string;
  kind: string;
  route: string | null;
  value: number | null;
  rating: string | null;
  meta: Record<string, unknown>;
  user_id: string | null;
  session_id: string | null;
  build_id: string | null;
};

const RANGES = [
  { label: "Last 1 hour", hours: 1 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 168 },
  { label: "Last 30 days", hours: 720 },
];

const VITAL_TARGETS = {
  lcp: { good: 2500, poor: 4000, label: "LCP", unit: "ms" },
  fcp: { good: 1800, poor: 3000, label: "FCP", unit: "ms" },
  inp: { good: 200, poor: 500, label: "INP", unit: "ms" },
  ttfb: { good: 800, poor: 1800, label: "TTFB", unit: "ms" },
  cls: { good: 0.1, poor: 0.25, label: "CLS", unit: "" },
} as const;

type VitalKind = keyof typeof VITAL_TARGETS;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function ratingFor(kind: VitalKind, v: number): "good" | "needs-improvement" | "poor" {
  const t = VITAL_TARGETS[kind];
  if (v <= t.good) return "good";
  if (v <= t.poor) return "needs-improvement";
  return "poor";
}

function ratingClasses(r: "good" | "needs-improvement" | "poor"): string {
  if (r === "good") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (r === "needs-improvement") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function fmtValue(kind: VitalKind, v: number): string {
  if (kind === "cls") return v.toFixed(3);
  return `${Math.round(v)} ms`;
}

export default function RumAnalytics() {
  const [hours, setHours] = useState(24);
  const [routeFilter, setRouteFilter] = useState("");

  const since = useMemo(() => subHours(new Date(), hours).toISOString(), [hours]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["rum-events", hours, routeFilter],
    queryFn: async (): Promise<RumEvent[]> => {
      let q = supabase
        .from("rum_events")
        .select("id,created_at,kind,route,value,rating,meta,user_id,session_id,build_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10_000);
      if (routeFilter.trim()) q = q.ilike("route", `%${routeFilter.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RumEvent[];
    },
    refetchInterval: 60_000,
  });

  const events = data ?? [];

  // ── Aggregations ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    for (const e of events) by[e.kind] = (by[e.kind] ?? 0) + 1;
    return by;
  }, [events]);

  const sessionsCount = useMemo(
    () => new Set(events.map((e) => e.session_id).filter(Boolean)).size,
    [events]
  );

  const errorEvents = events.filter((e) => e.kind === "error" || e.kind === "rejection");
  const navEvents = events.filter((e) => e.kind === "nav");
  const sessionsWithError = new Set(errorEvents.map((e) => e.session_id).filter(Boolean)).size;
  const errorRate = sessionsCount > 0 ? (sessionsWithError / sessionsCount) * 100 : 0;

  // p75 per route per vital kind
  type RouteVital = { route: string; samples: number; p50: number; p75: number; p95: number };
  function p75ByRoute(kind: VitalKind): RouteVital[] {
    const groups: Record<string, number[]> = {};
    for (const e of events) {
      if (e.kind !== kind || e.value == null || !e.route) continue;
      (groups[e.route] ??= []).push(e.value);
    }
    return Object.entries(groups)
      .map(([route, vals]) => ({
        route,
        samples: vals.length,
        p50: percentile(vals, 50),
        p75: percentile(vals, 75),
        p95: percentile(vals, 95),
      }))
      .sort((a, b) => b.p75 - a.p75);
  }

  // Vitals timeseries — hourly buckets of p75 LCP & FCP across all routes
  const timeseries = useMemo(() => {
    const bucketHours = hours <= 6 ? 0.25 : hours <= 24 ? 1 : hours <= 168 ? 6 : 24;
    const buckets: Record<number, { lcp: number[]; fcp: number[] }> = {};
    for (const e of events) {
      if (e.value == null) continue;
      if (e.kind !== "lcp" && e.kind !== "fcp") continue;
      const t = new Date(e.created_at).getTime();
      const bucket = Math.floor(t / (bucketHours * 3600_000)) * (bucketHours * 3600_000);
      (buckets[bucket] ??= { lcp: [], fcp: [] })[e.kind as "lcp" | "fcp"].push(e.value);
    }
    return Object.entries(buckets)
      .map(([k, v]) => ({
        t: Number(k),
        label: format(new Date(Number(k)), bucketHours < 1 ? "HH:mm" : bucketHours <= 6 ? "MMM d HH:mm" : "MMM d"),
        lcp_p75: Math.round(percentile(v.lcp, 75)),
        fcp_p75: Math.round(percentile(v.fcp, 75)),
      }))
      .sort((a, b) => a.t - b.t);
  }, [events, hours]);

  // Slow-route ranking — by p75 LCP, top 10
  const slowRoutes = useMemo(() => p75ByRoute("lcp").slice(0, 10), [events]);

  // Recent errors
  const recentErrors = errorEvents.slice(0, 25);

  // Overall p75 per vital
  function overall(kind: VitalKind) {
    const vals = events.filter((e) => e.kind === kind && e.value != null).map((e) => e.value as number);
    return { samples: vals.length, p75: percentile(vals, 75) };
  }

  return (
    <div className="space-y-4">
      <header data-testid="page-header" className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            RUM Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Real User Monitoring — Core Web Vitals, errors, and slow routes from production traffic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.hours} value={String(r.hours)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            placeholder="Filter route (e.g. /dashboard)"
            className="h-9 w-[220px]"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
        </div>
      </header>

      {/* Active filter summary — also shown when printed */}
      <div className="text-xs text-muted-foreground print:text-black">
        Range: <span className="font-medium">{RANGES.find((r) => r.hours === hours)?.label ?? `Last ${hours}h`}</span>
        {" · "}From <span className="font-mono">{format(new Date(since), "yyyy-MM-dd HH:mm")}</span>
        {" to "}<span className="font-mono">{format(new Date(), "yyyy-MM-dd HH:mm")}</span>
        {routeFilter.trim() && <> · Route filter: <span className="font-mono">{routeFilter.trim()}</span></>}
      </div>



      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi icon={Activity} label="Events" value={events.length.toLocaleString()} />
        <Kpi icon={Activity} label="Sessions" value={sessionsCount.toLocaleString()} />
        <Kpi
          icon={AlertTriangle}
          label="Error rate"
          value={`${errorRate.toFixed(1)}%`}
          tone={errorRate >= 5 ? "err" : errorRate >= 1 ? "warn" : "ok"}
        />
        {(Object.keys(VITAL_TARGETS) as VitalKind[]).map((k) => {
          const o = overall(k);
          const r = o.samples ? ratingFor(k, o.p75) : "good";
          return (
            <Kpi
              key={k}
              icon={Gauge}
              label={`${VITAL_TARGETS[k].label} p75`}
              value={o.samples ? fmtValue(k, o.p75) : "—"}
              tone={r === "good" ? "ok" : r === "needs-improvement" ? "warn" : "err"}
              sub={`${o.samples} sample${o.samples === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="routes">Slow routes</TabsTrigger>
          <TabsTrigger value="errors">Errors ({errorEvents.length})</TabsTrigger>
          <TabsTrigger value="nav">Navigation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">LCP &amp; FCP p75 over time</CardTitle>
            </CardHeader>
            <CardContent>
              {timeseries.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeseries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="ms" />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="lcp_p75" name="LCP p75" stroke="hsl(152 70% 30%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="fcp_p75" name="FCP p75" stroke="hsl(220 80% 40%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(["lcp", "fcp"] as VitalKind[]).map((k) => {
              const rows = p75ByRoute(k).slice(0, 8);
              return (
                <Card key={k}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Worst routes by {VITAL_TARGETS[k].label} p75</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rows.length === 0 ? <EmptyState /> : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tick={{ fontSize: 11 }} unit="ms" />
                            <YAxis type="category" dataKey="route" tick={{ fontSize: 10 }} width={140} />
                            <Tooltip />
                            <Bar dataKey="p75" name={`${VITAL_TARGETS[k].label} p75`} fill="hsl(152 70% 30%)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="routes">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Slow-route ranking (by LCP p75)
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                disabled={slowRoutes.length === 0}
                onClick={() => {
                  const rows: (string | number)[][] = [
                    ["Route", "Samples", "p50 (ms)", "p75 (ms)", "p95 (ms)", "Rating"],
                    ...slowRoutes.map((r) => [
                      r.route,
                      r.samples,
                      Math.round(r.p50),
                      Math.round(r.p75),
                      Math.round(r.p95),
                      ratingFor("lcp", r.p75),
                    ]),
                  ];
                  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label ?? `Last ${hours}h`;
                  const preamble: string[][] = [
                    ["Report", "RUM Slow Routes (LCP p75)"],
                    ["Time range", rangeLabel],
                    ["From", format(new Date(since), "yyyy-MM-dd HH:mm")],
                    ["To", format(new Date(), "yyyy-MM-dd HH:mm")],
                    ["Route filter", routeFilter.trim() || "(none)"],
                    ["Generated at", new Date().toISOString()],
                  ];
                  downloadCsv(`rum-slow-routes-${format(new Date(), "yyyyMMdd-HHmm")}.csv`, rows, preamble);
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {slowRoutes.length === 0 ? <EmptyState /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 700 }}>
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3">Route</th>
                        <th className="py-2 pr-3 text-right">Samples</th>
                        <th className="py-2 pr-3 text-right">p50</th>
                        <th className="py-2 pr-3 text-right">p75</th>
                        <th className="py-2 pr-3 text-right">p95</th>
                        <th className="py-2 pr-3 text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slowRoutes.map((r) => {
                        const rating = ratingFor("lcp", r.p75);
                        return (
                          <tr key={r.route} className="border-b">
                            <td className="py-2 pr-3 font-mono text-xs">{r.route}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.samples}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.p50)} ms</td>
                            <td className="py-2 pr-3 text-right tabular-nums font-semibold">{Math.round(r.p75)} ms</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.p95)} ms</td>
                            <td className="py-2 pr-3 text-right">
                              <Badge className={ratingClasses(rating)} variant="outline">{rating}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Recent errors &amp; unhandled rejections
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                disabled={errorEvents.length === 0}
                onClick={() => {
                  const rows: (string | number)[][] = [
                    ["Timestamp", "Kind", "Route", "Message", "Filename", "Session", "User", "Stack"],
                    ...errorEvents.map((e) => {
                      const m = (e.meta ?? {}) as { message?: string; filename?: string; stack?: string };
                      return [
                        e.created_at,
                        e.kind,
                        e.route ?? "",
                        m.message ?? "",
                        m.filename ?? "",
                        e.session_id ?? "",
                        e.user_id ?? "",
                        m.stack ?? "",
                      ];
                    }),
                  ];
                  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label ?? `Last ${hours}h`;
                  const preamble: string[][] = [
                    ["Report", "RUM Errors & Unhandled Rejections"],
                    ["Time range", rangeLabel],
                    ["From", format(new Date(since), "yyyy-MM-dd HH:mm")],
                    ["To", format(new Date(), "yyyy-MM-dd HH:mm")],
                    ["Route filter", routeFilter.trim() || "(none)"],
                    ["Generated at", new Date().toISOString()],
                  ];
                  downloadCsv(`rum-errors-${format(new Date(), "yyyyMMdd-HHmm")}.csv`, rows, preamble);
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {recentErrors.length === 0 ? <EmptyState label="No errors in this window 🎉" /> : (
                <ul className="space-y-2">
                  {recentErrors.map((e) => {
                    const meta = (e.meta ?? {}) as { message?: string; filename?: string; stack?: string };
                    return (
                      <li key={e.id} className="rounded-md border p-2 bg-background">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={e.kind === "error" ? "border-red-300 text-red-700" : "border-amber-300 text-amber-700"}>
                            {e.kind}
                          </Badge>
                          <span className="font-mono">{e.route}</span>
                          <span>·</span>
                          <span>{format(new Date(e.created_at), "dd/MM HH:mm:ss")}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium break-words">{meta.message ?? "—"}</div>
                        {meta.filename && (
                          <div className="text-[11px] text-muted-foreground font-mono">{meta.filename}</div>
                        )}
                        {meta.stack && (
                          <details className="mt-1">
                            <summary className="text-[11px] text-muted-foreground cursor-pointer">Stack</summary>
                            <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground mt-1">{meta.stack}</pre>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nav">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Page navigation duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">
                {navEvents.length} initial navigation event(s), {(totals.route ?? 0)} SPA route transition(s).
              </div>
              {navEvents.length === 0 ? <EmptyState /> : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Kpi icon={Activity} label="Nav p50" value={`${Math.round(percentile(navEvents.map(n => n.value ?? 0), 50))} ms`} />
                  <Kpi icon={Activity} label="Nav p75" value={`${Math.round(percentile(navEvents.map(n => n.value ?? 0), 75))} ms`} />
                  <Kpi icon={Activity} label="Nav p95" value={`${Math.round(percentile(navEvents.map(n => n.value ?? 0), 95))} ms`} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: { icon: any; label: string; value: string; sub?: string; tone?: "ok" | "warn" | "err" }) {
  const toneCls =
    tone === "err" ? "border-red-300 bg-red-50 dark:bg-red-950/20"
    : tone === "warn" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
    : tone === "ok" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
    : "";
  return (
    <div className={`rounded-md border p-3 bg-background ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-lg font-bold mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ label = "No data in this window" }: { label?: string }) {
  return (
    <div className="text-xs text-muted-foreground py-8 text-center">{label}</div>
  );
}
