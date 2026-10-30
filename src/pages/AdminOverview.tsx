import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRbac } from "@/hooks/useRbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/date-format";
import { regionalCardPath, type RegionalCommandCard } from "@/lib/regional-commands";
import { CommandApprovalQueue } from "@/components/hr/CommandApprovalQueue";
import { DashboardSyncStatus } from "@/components/dashboard/DashboardSyncStatus";
import { dashboardRetry, reportingSince, sumCounts } from "@/lib/dashboard-integrity";
import { Briefcase, FileDown, LayoutDashboard, Users } from "lucide-react";

type Summary = {
  as_of: string;
  staff: { total: number; assigned: number; unassigned: number; by_status: Record<string, number> };
  applications: Record<string, number>; transfers: Record<string, number>;
  appointments: number; promotions: Record<string, number>; exits: Record<string, number>;
  attendance: Record<string, number>; leave: Record<string, number>; certifications: number;
  downloads: null | { total: number; records: number; recent: { id: string; format: string; row_count: number; created_at: string }[] };
};

function Totals({ title, total, parts, icon: Icon, to, note }: { title: string; total: number | string; parts?: Record<string, number>; icon: any; to?: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold">{total}</div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <div className="flex flex-wrap gap-1">
          {Object.entries(parts ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="capitalize">{k.replace(/_/g, " ")}: {v}</Badge>
          ))}
        </div>
        {to && <Button asChild variant="link" size="sm" className="px-0"><Link to={to}>Open</Link></Button>}
      </CardContent>
    </Card>
  );
}

export default function AdminOverview() {
  const { can } = useRbac();
  const [range, setRange] = useState("30");
  const [command, setCommand] = useState("all");
  const [search, setSearch] = useState("");
  const from = useMemo(() => reportingSince(range), [range]);

  const commands = useQuery({
    queryKey: ["admin-overview-commands"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("regional_commands_overview");
      if (error) throw error;
      return (data ?? []) as RegionalCommandCard[];
    },
    refetchInterval: 60_000,
  });

  const summary = useQuery({
    queryKey: ["admin-overview-summary", range, command],
    refetchInterval: 60_000,
    retry: dashboardRetry,
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc("hrm_dashboard_summary", {
        _org_unit_id: command === "all" ? undefined : command,
        _since: from ?? undefined,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("staff" in data)) throw new Error("Dashboard figures unavailable");
      return data as unknown as Summary;
    },
  });
  const metrics = summary.isError ? undefined : summary.data;
  const total = (parts: Record<string, number> | undefined) => metrics ? sumCounts(parts) : summary.isError ? "—" : "…";
  const cmdList = commands.data ?? [];
  const shownCmds = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cmdList.filter((c) => (command === "all" || c.id === command) && (!s || c.name.toLowerCase().includes(s)));
  }, [cmdList, command, search]);
  const kycRows = metrics?.downloads?.recent ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      </div>

      <DashboardSyncStatus updatedAt={summary.dataUpdatedAt} failed={summary.isError || commands.isError} fetching={summary.isFetching} onRetry={() => { void summary.refetch(); void commands.refetch(); }} />
      <div className="flex flex-wrap gap-3">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40" aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={command} onValueChange={setCommand}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Command"><SelectValue placeholder="All commands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All commands</SelectItem>
            {cmdList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="w-56" placeholder="Search commands…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search commands" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Totals title="Total personnel" total={metrics?.staff.total ?? (summary.isError ? "—" : "…")} parts={metrics?.staff.by_status} icon={Users} note={metrics ? `${metrics.staff.assigned} assigned · ${metrics.staff.unassigned} unassigned` : undefined} to="/regional-commands" />
        <Totals title="Staff applications" total={total(metrics?.applications)} parts={metrics?.applications} icon={Briefcase} to="/hr/applications" />
        <Totals title="Transfer requests" total={total(metrics?.transfers)} parts={metrics?.transfers} icon={Briefcase} to="/hr/applications" />
        <Totals title="Bio-Data & Service Record downloads" total={metrics?.downloads?.total ?? "—"} icon={FileDown} note={metrics?.downloads ? `${metrics.downloads.records} records downloaded` : "Super Admins only"} />
      </div>

      <CommandApprovalQueue />

      <section className="space-y-3" aria-label="Workforce availability">
        <h2 className="text-base font-semibold">Workforce availability</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Totals title="Attendance today" total={total(metrics?.attendance)} parts={metrics?.attendance} icon={Users} />
          <Totals title="Leave requests" total={total(metrics?.leave)} parts={metrics?.leave} icon={Briefcase} />
          <Totals title="Professional certifications" total={metrics?.certifications ?? (summary.isError ? "—" : "…")} icon={Briefcase} />
        </div>
      </section>
      <section className="space-y-3" aria-label="HR service records">
        <h2 className="text-base font-semibold">HR service records</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Totals title="Appointments" total={metrics?.appointments ?? (summary.isError ? "—" : "…")} icon={Users} to="/hr" />
          <Totals title="Promotions" total={total(metrics?.promotions)} parts={metrics?.promotions} icon={Users} />
          <Totals title="Resignations & exits" total={total(metrics?.exits)} parts={metrics?.exits} icon={Users} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Command dashboards</CardTitle></CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {shownCmds.length === 0 && <p className="text-sm text-muted-foreground">No commands match.</p>}
            {shownCmds.map((c) => {
              const path = regionalCardPath(c, can("command-analytics"));
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{commands.isError ? "Unavailable" : c.staff_count ?? "—"} staff · {c.activation_status === "active" ? "Active" : "Paused"}</div>
                  </div>
                  {path && <Button asChild size="sm" variant="outline"><Link to={path}><LayoutDashboard className="mr-1 h-4 w-4" />Dashboard</Link></Button>}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Bio-Data & Service Record downloads</CardTitle></CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {!metrics?.downloads && <p className="text-sm text-muted-foreground">Only Super Admins can view the download history.</p>}
            {metrics?.downloads && kycRows.length === 0 && <p className="text-sm text-muted-foreground">No Bio-Data & Service Record downloads in this period.</p>}
            {kycRows.slice(0, 25).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{r.row_count ?? 0} records · {r.format.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
