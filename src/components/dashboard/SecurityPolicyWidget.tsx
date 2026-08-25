import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Unlock, ShieldAlert, MonitorSmartphone, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "@/lib/date-format";

interface LockedStaff {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  account_locked: boolean;
  login_enabled: boolean;
  recent_attempts: number;
}
interface AtRisk {
  staff_id: string;
  full_name: string | null;
  attempts: number;
  remaining: number;
  last_attempt: string;
  last_ip: string | null;
}
interface LockoutEvent {
  id: string;
  staff_id: string;
  full_name: string | null;
  attempts: number;
  threshold: number;
  ip_address: string | null;
  locked_at: string;
}
interface UnlockEvent {
  id: string;
  staff_id: string | null;
  full_name: string | null;
  unlocked_by: string | null;
  reason: string | null;
  created_at: string;
}
interface SessionEvent {
  id: string;
  action: string;
  staff_id: string | null;
  full_name: string | null;
  sessions_affected: number;
  reason: string | null;
  created_at: string;
}
interface PolicyDashboard {
  generated_at: string;
  hours: number;
  threshold: number;
  window_minutes: number;
  auto_unlock_minutes: number | null;
  max_concurrent_sessions: number;
  locked_staff: LockedStaff[];
  at_risk: AtRisk[];
  recent_lockouts: LockoutEvent[];
  recent_unlocks: UnlockEvent[];
  session_revocations: SessionEvent[];
  counts: { locked: number; lockouts: number; unlocks: number; limit_revocations: number };
}

const TIMEFRAMES: { value: string; label: string }[] = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

const ACTION_LABELS: Record<string, string> = {
  session_limit_enforced: "Device limit",
  logout_session: "Ended by admin",
  logout_all: "All devices ended",
};

/**
 * Access-policy security posture: who is locked out right now, who is close to
 * lockout, and what the policy has enforced over the selected timeframe.
 * Admin / command tier only — the RPC refuses anyone else.
 */
export default function SecurityPolicyWidget() {
  const navigate = useNavigate();
  const [hours, setHours] = useState("24");

  const { data, isLoading, isFetching, refetch } = useQuery<PolicyDashboard | null>({
    queryKey: ["security-policy-dashboard", hours],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("security_policy_dashboard" as never, {
        _hours: Number(hours),
      } as never);
      if (error) throw error;
      return data as unknown as PolicyDashboard;
    },
  });

  const counts = data?.counts;

  return (
    <Card className={(counts?.locked ?? 0) > 0 ? "border-destructive/40" : "border-border/50"}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Access policy enforcement
          </CardTitle>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data
              ? `${data.threshold} attempts / ${data.window_minutes} min · ${
                  data.auto_unlock_minutes ? `auto-unlock after ${data.auto_unlock_minutes} min` : "admin unlock required"
                } · device cap ${data.max_concurrent_sessions || "unlimited"}`
              : "Loading policy…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Timeframe">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh security policy data"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile icon={Lock} label="Locked now" value={counts?.locked ?? 0} tone={(counts?.locked ?? 0) > 0 ? "danger" : "default"} />
          <Tile icon={ShieldAlert} label="Lockouts" value={counts?.lockouts ?? 0} tone={(counts?.lockouts ?? 0) > 0 ? "warn" : "default"} />
          <Tile icon={Unlock} label="Admin unlocks" value={counts?.unlocks ?? 0} tone="default" />
          <Tile icon={MonitorSmartphone} label="Session revocations" value={counts?.limit_revocations ?? 0} tone="default" />
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading enforcement activity…
          </div>
        )}

        <Tabs defaultValue="locked">
          <TabsList className="h-8">
            <TabsTrigger value="locked" className="text-xs">Locked ({data?.locked_staff?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs">Attempts left ({data?.at_risk?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="lockouts" className="text-xs">Lockouts ({data?.recent_lockouts?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="sessions" className="text-xs">Sessions ({data?.session_revocations?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="locked" className="mt-3">
            <ScrollTable
              head={["Staff", "Staff ID", "State", "Recent attempts"]}
              rows={(data?.locked_staff ?? []).map((r) => [
                r.full_name || "—",
                r.staff_id ?? "—",
                <span key="s" className="space-x-1">
                  {r.account_locked && <Badge variant="destructive" className="text-[10px]">Locked</Badge>}
                  {!r.login_enabled && <Badge variant="outline" className="text-[10px]">Login disabled</Badge>}
                </span>,
                String(r.recent_attempts),
              ])}
              empty="No locked accounts."
            />
          </TabsContent>

          <TabsContent value="risk" className="mt-3">
            <ScrollTable
              head={["Staff ID", "Name", "Attempts", "Remaining", "Last attempt"]}
              rows={(data?.at_risk ?? []).map((r) => [
                r.staff_id,
                r.full_name || "—",
                String(r.attempts),
                <Badge
                  key="r"
                  variant={r.remaining === 0 ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {r.remaining} left
                </Badge>,
                formatDateTime(r.last_attempt),
              ])}
              empty={`No failed attempts in the last ${data?.window_minutes ?? 15} minutes.`}
            />
          </TabsContent>

          <TabsContent value="lockouts" className="mt-3 space-y-3">
            <ScrollTable
              head={["When", "Staff", "Attempts", "IP"]}
              rows={(data?.recent_lockouts ?? []).map((r) => [
                formatDateTime(r.locked_at),
                `${r.full_name || "—"} (${r.staff_id})`,
                `${r.attempts}/${r.threshold}`,
                r.ip_address ?? "—",
              ])}
              empty="No lockouts in this timeframe."
            />
            {(data?.recent_unlocks?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Administrator unlocks</p>
                <ScrollTable
                  head={["When", "Staff", "Unlocked by", "Reason"]}
                  rows={(data?.recent_unlocks ?? []).map((r) => [
                    formatDateTime(r.created_at),
                    `${r.full_name || "—"} (${r.staff_id ?? "—"})`,
                    r.unlocked_by ?? "—",
                    r.reason ?? "—",
                  ])}
                  empty="No unlocks."
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="sessions" className="mt-3">
            <ScrollTable
              head={["When", "Staff", "Event", "Sessions", "Reason"]}
              rows={(data?.session_revocations ?? []).map((r) => [
                formatDateTime(r.created_at),
                `${r.full_name || "—"} (${r.staff_id ?? "—"})`,
                <Badge
                  key="a"
                  variant={r.action === "session_limit_enforced" ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {ACTION_LABELS[r.action] ?? r.action}
                </Badge>,
                String(r.sessions_affected),
                r.reason ?? "—",
              ])}
              empty="No session revocations in this timeframe."
            />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => navigate("/settings?tab=locked-accounts")}>
            Locked accounts <ArrowRight className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => navigate("/admin/sessions")}>
            Session management <ArrowRight className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => navigate("/settings?tab=access-policy")}>
            Access policy <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function ScrollTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="max-h-[280px] overflow-auto rounded-lg border">
      <div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              {head.map((h) => (
                <TableHead key={h} className="text-xs">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((cells, i) => (
              <TableRow key={i}>
                {cells.map((c, j) => (
                  <TableCell key={j} className="text-xs whitespace-nowrap">{c}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
