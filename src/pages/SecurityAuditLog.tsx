import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, KeyRound, Loader2, Lock, MonitorSmartphone, ShieldAlert } from "lucide-react";
import { format, subDays } from "date-fns";
import { downloadCSVString } from "@/lib/download-utils";
import { SecurityHero } from "@/components/security/SecurityHero";
import { buildCsv } from "@/lib/csv-safe";

type FeedRow = {
  id: string;
  occurred_at: string;
  category: "lockout" | "mfa" | "session" | string;
  action: string;
  severity: string | null;
  staff_id: string | null;
  subject_name: string | null;
  actor_name: string | null;
  ip_address: string | null;
  detail: string | null;
};

const RANGES = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const CATEGORY_META: Record<string, { label: string; icon: typeof Lock }> = {
  lockout: { label: "Lockouts & unlocks", icon: Lock },
  mfa: { label: "Two-factor events", icon: KeyRound },
  session: { label: "Session revocations", icon: MonitorSmartphone },
};

function severityVariant(severity: string | null) {
  switch ((severity ?? "info").toLowerCase()) {
    case "critical":
      return "destructive" as const;
    case "warning":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function prettyAction(action: string) {
  return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function SecurityAuditLog() {
  const { isAdmin, isOic, is2ic } = useAuth();
  const allowed = isAdmin || isOic || is2ic;

  const [days, setDays] = useState("7");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["security-audit-log", days],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("security_event_feed" as any, {
        _from: subDays(new Date(), Number(days)).toISOString(),
        _to: new Date().toISOString(),
        _limit: 1000,
      });
      if (error) throw error;
      return (data ?? []) as FeedRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (severity !== "all" && (r.severity ?? "info").toLowerCase() !== severity) return false;
      if (s) {
        const blob = `${r.subject_name ?? ""} ${r.staff_id ?? ""} ${r.actor_name ?? ""} ${r.action} ${r.detail ?? ""} ${r.ip_address ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [rows, category, severity, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { lockout: 0, mfa: 0, session: 0 };
    for (const r of rows) if (r.category in c) c[r.category] += 1;
    return c;
  }, [rows]);

  const exportCsv = () => {
    const csv = buildCsv(
      ["When", "Category", "Event", "Severity", "Staff ID", "Staff", "Actioned by", "IP address", "Details"],
      filtered.map((r) => [
        format(new Date(r.occurred_at), "dd/MM/yyyy HH:mm:ss"),
        CATEGORY_META[r.category]?.label ?? r.category,
        prettyAction(r.action),
        r.severity ?? "info",
        r.staff_id ?? "",
        r.subject_name ?? "",
        r.actor_name ?? "",
        r.ip_address ?? "",
        r.detail ?? "",
      ]),
    );
    downloadCSVString(csv, `security-audit-log-${format(new Date(), "yyyyMMdd-HHmm")}.csv`);
  };

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      <SecurityHero
        icon={ShieldAlert}
        title="Security Audit Log"
        subtitle="Account lockouts and unlocks, two-factor enrolments, verifications and resets, and sessions ended by the device limit — in one timeline."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 py-4">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xl font-semibold leading-none">{counts[key] ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Security events
            <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Input
                placeholder="Search staff, event, IP, reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
                aria-label="Search security events"
              />
            </div>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 w-40" aria-label="Timeframe"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-48" aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="lockout">Lockouts & unlocks</SelectItem>
                <SelectItem value="mfa">Two-factor events</SelectItem>
                <SelectItem value="session">Session revocations</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-9 w-36" aria-label="Severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" disabled={filtered.length === 0} onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-destructive">Could not load the security audit log.</p>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Actioned by</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground italic">
                    No security events match your filters.
                  </TableCell></TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={`${r.category}-${r.id}`}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(r.occurred_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Badge variant={severityVariant(r.severity)} className="text-[10px]">{prettyAction(r.action)}</Badge>
                        <span className="text-[10px] text-muted-foreground">{CATEGORY_META[r.category]?.label ?? r.category}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.subject_name ?? "—"}
                        {r.staff_id ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.staff_id}</span> : null}
                      </TableCell>
                      <TableCell className="text-xs">{r.actor_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-[11px]">{r.ip_address ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate" title={r.detail ?? ""}>
                        {r.detail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
