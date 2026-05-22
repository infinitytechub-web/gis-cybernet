import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Gauge, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const POLL_MS = 60_000; // 1 minute
const LONG_TASK_CAP = 99;

interface ClientPerf {
  jsHeapMb: number | null;
  domNodes: number;
  longTasks: number;
  navMs: number | null;
  fps: number | null;
}

function useClientPerf(refreshKey: number, isVisible: boolean): ClientPerf {
  const [perf, setPerf] = useState<ClientPerf>({
    jsHeapMb: null, domNodes: 0, longTasks: 0, navMs: null, fps: null,
  });

  // Long task observer (cumulative, capped)
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    let count = 0;
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((list) => {
        count = Math.min(LONG_TASK_CAP, count + list.getEntries().length);
        setPerf((p) => ({ ...p, longTasks: count }));
      });
      obs.observe({ type: "longtask", buffered: true });
    } catch { /* unsupported */ }
    return () => obs?.disconnect();
  }, []);

  // FPS sample (~1s) on each refresh — only when visible
  useEffect(() => {
    if (!isVisible) return;
    let frames = 0;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 1000) {
        raf = requestAnimationFrame(tick);
      } else {
        setPerf((p) => ({ ...p, fps: frames }));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [refreshKey, isVisible]);

  // Heap + DOM + nav timing snapshot
  useEffect(() => {
    if (!isVisible) return;
    const heap = (performance as any).memory?.usedJSHeapSize;
    const domNodes = document.getElementsByTagName("*").length;
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const navMs = navEntry ? Math.round(navEntry.loadEventEnd - navEntry.startTime) : null;
    setPerf((p) => ({
      ...p,
      jsHeapMb: heap ? Math.round(heap / 1024 / 1024) : null,
      domNodes,
      navMs,
    }));
  }, [refreshKey, isVisible]);

  return perf;
}

export default function SystemHealthCheckWidget() {
  const { isAdmin } = useAuth();
  const [refreshKey, setRefreshKey] = useState(1);
  const [autoRefreshAt, setAutoRefreshAt] = useState<Date>(new Date());
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: only run heavy work when card is visible
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-refresh ticker — only when visible
  useEffect(() => {
    if (!isAdmin || !isVisible) return;
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setAutoRefreshAt(new Date());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isAdmin, isVisible]);

  const perf = useClientPerf(refreshKey, isVisible);

  // Backend error signals — last 24h
  const since = useMemo(() => {
    const d = new Date(); d.setHours(d.getHours() - 24); return d.toISOString();
  }, [refreshKey]);

  const { data: errorCounts, isFetching } = useQuery({
    queryKey: ["health-check-errors", refreshKey],
    enabled: isAdmin,
    queryFn: async () => {
      const [incidents, failedLogins, deletes] = await Promise.all([
        supabase.from("security_incidents").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("failed_login_attempts").select("id", { count: "exact", head: true }).gte("attempted_at", since),
        supabase.from("system_audit_log").select("id", { count: "exact", head: true }).eq("action", "deleted").gte("created_at", since),
      ]);
      return {
        incidents: incidents.count ?? 0,
        failedLogins: failedLogins.count ?? 0,
        deletes: deletes.count ?? 0,
        errors: (incidents.error ? 1 : 0) + (failedLogins.error ? 1 : 0) + (deletes.error ? 1 : 0),
      };
    },
    refetchInterval: isVisible ? POLL_MS : false,
  });

  if (!isAdmin) return null;

  // Severity scoring
  const issues: { level: "warn" | "err"; text: string }[] = [];
  if (perf.fps !== null && perf.fps < 30) issues.push({ level: "warn", text: `Low frame rate (${perf.fps} fps)` });
  if (perf.jsHeapMb !== null && perf.jsHeapMb > 250) issues.push({ level: "warn", text: `High JS heap (${perf.jsHeapMb} MB)` });
  if (perf.domNodes > 5000) issues.push({ level: "warn", text: `Heavy DOM (${perf.domNodes} nodes)` });
  if (perf.longTasks > 25) issues.push({ level: "warn", text: `${perf.longTasks} long tasks` });
  if ((errorCounts?.incidents ?? 0) > 0) issues.push({ level: "err", text: `${errorCounts!.incidents} security incident(s) (24h)` });
  if ((errorCounts?.failedLogins ?? 0) > 20) issues.push({ level: "warn", text: `${errorCounts!.failedLogins} failed logins (24h)` });

  const overall = issues.some((i) => i.level === "err") ? "err" : issues.length > 0 ? "warn" : "ok";

  const statusBadge =
    overall === "ok"
      ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Healthy</Badge>
      : overall === "warn"
      ? <Badge className="bg-amber-100 text-amber-800 border-amber-200">Watch</Badge>
      : <Badge className="bg-red-100 text-red-800 border-red-200">Action needed</Badge>;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          System Health Check
          <span className="text-[10px] font-normal text-muted-foreground">
            (admin only · auto-scan every {Math.round(POLL_MS / 1000)}s)
          </span>
          {statusBadge}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Last: {format(autoRefreshAt, "HH:mm:ss")}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => { setRefreshKey((k) => k + 1); setAutoRefreshAt(new Date()); }}
            title="Re-scan now"
            aria-label="Re-scan now"
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <Metric icon={Cpu} label="JS heap" value={perf.jsHeapMb !== null ? `${perf.jsHeapMb} MB` : "—"} />
          <Metric icon={Activity} label="FPS" value={perf.fps !== null ? `${perf.fps}` : "…"} />
          <Metric icon={Activity} label="DOM nodes" value={perf.domNodes.toLocaleString()} />
          <Metric icon={Activity} label="Long tasks" value={perf.longTasks.toLocaleString()} />
          <Metric icon={Activity} label="Page load" value={perf.navMs !== null ? `${perf.navMs} ms` : "—"} />
          <Metric icon={ShieldAlert} label="Incidents 24h" value={`${errorCounts?.incidents ?? 0}`} />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Metric icon={ShieldAlert} label="Failed logins (24h)" value={`${errorCounts?.failedLogins ?? 0}`} compact />
          <Metric icon={ShieldAlert} label="Deletes (24h)" value={`${errorCounts?.deletes ?? 0}`} compact />
        </div>
        <div className="mt-3">
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              No issues detected. System running smoothly.
            </div>
          ) : (
            <ul className="space-y-1">
              {issues.map((iss, i) => (
                <li key={i} className={`flex items-center gap-2 text-xs ${iss.level === "err" ? "text-red-700" : "text-amber-700"}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {iss.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, compact }: { icon: any; label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-md border bg-background ${compact ? "p-2" : "p-3"}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`${compact ? "text-base" : "text-lg"} font-bold mt-0.5 tabular-nums`}>{value}</div>
    </div>
  );
}
