import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/date-format";
import { dashboardSyncState } from "@/lib/dashboard-integrity";
import { useDashboardConnection } from "./DashboardSyncProvider";

export function DashboardSyncStatus({ updatedAt, failed = false, fetching = false, onRetry }: { updatedAt: number; failed?: boolean; fetching?: boolean; onRetry?: () => void }) {
  const { online, connected } = useDashboardConnection();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const state = dashboardSyncState(online, failed, updatedAt, now);
  const label = { offline: "Offline · showing last saved figures", failed: "Update failed · figures may be outdated", loading: "Loading figures…", stale: "Figures are outdated", current: connected ? "Connected · automatic updates" : "Automatic checks · every minute" }[state];
  const Icon = state === "offline" ? WifiOff : state === "failed" || state === "stale" ? AlertTriangle : CheckCircle2;
  return <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <Icon className={`h-4 w-4 ${state === "failed" ? "text-destructive" : "text-primary"}`} aria-hidden="true" />
    <span>{label}</span>
    {updatedAt > 0 && <span>Last updated {formatDateTime(new Date(updatedAt).toISOString())}</span>}
    {onRetry && <Button variant="ghost" size="sm" onClick={onRetry} disabled={!online || fetching} aria-label="Refresh dashboard"><RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button>}
  </div>;
}