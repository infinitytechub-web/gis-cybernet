/**
 * Command & Department Analytics — interactive command/department cards with
 * live breakdowns (sex, rank, role, region, department, command) and a
 * stand-alone dashboard per command at /command-analytics/:unitId.
 * All figures come from the scoped `staff_analytics` RPC; the server decides
 * which commands the caller may see.
 */
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from "recharts";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDirectoryPermissions } from "@/hooks/useDirectoryPermissions";
import { exportReport, type ExportFormat } from "@/lib/export-utils";
import { logAdminAudit } from "@/lib/admin-audit";
import { KpiTile, accentFor } from "@/components/dashboard/KpiTile";
import { activeRatioAlert, strengthAlert } from "@/lib/staffing-indicators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, ArrowLeft, Building2, Download, ExternalLink, Network, Pencil,
  Printer, Trash2, UserCheck, Users, X,
} from "lucide-react";

type Bucket = { id: string | null; name: string; count: number; active: number; authorised?: number | null };
type StaffRow = {
  id: string; staff_id: string | null; name: string; sex: string; rank: string;
  roles: string; department: string; command: string; region: string; status: string;
  intake: number | null;
};
type Analytics = {
  total: number; active: number;
  by_status: Record<string, number>; by_sex: Record<string, number>;
  by_rank: Record<string, number>; by_role: Record<string, number>;
  by_region: Record<string, number>;
  by_department: Bucket[]; by_command: Bucket[]; staff: StaffRow[];
};

const pretty = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function useAnalytics(unitId: string | null, deptId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["staff-analytics", unitId, deptId];
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`staff-analytics-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () =>
        qc.invalidateQueries({ queryKey: ["staff-analytics"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, qc]);
  return useQuery({
    queryKey: key,
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Analytics> => {
      const { data, error } = await supabase.rpc("staff_analytics", {
        _org_unit_id: unitId ?? undefined, _department_id: deptId ?? undefined,
      } as never);
      if (error) throw error;
      return data as unknown as Analytics;
    },
  });
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="max-h-64 space-y-1.5 overflow-y-auto">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
        {entries.map(([k, v], i) => (
          <div key={k} className="text-xs">
            <div className="flex justify-between"><span className="truncate">{pretty(k)}</span><span className="tabular-nums font-medium">{v}</span></div>
            <div className="mt-0.5 h-1.5 rounded bg-muted"><div className="h-1.5 rounded transition-all" style={{ width: `${(v / max) * 100}%`, background: `hsl(var(--cat-${(i % 8) + 1}))` }} /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function CommandAnalytics() {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const perms = useDirectoryPermissions();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [intakeFilter, setIntakeFilter] = useState("all");
  const [toDelete, setToDelete] = useState<StaffRow | null>(null);
  const [reason, setReason] = useState("");

  const scope = useAnalytics(unitId ?? null, null);
  const view = useAnalytics(unitId ?? null, deptId);
  const a = view.data;
  const { data: baseline = {} } = useQuery({
    queryKey: ["command-analytics-baseline"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("command_analytics_baseline", { _days: 7 });
      const m: Record<string, { total: number; active: number }> = {};
      (data ?? []).forEach((r: any) => { m[r.org_unit_id] = r; });
      return m;
    },
  });
  const scopeTotalPrev = unitId && baseline[unitId] ? baseline[unitId].total : null;
  const alerts = useMemo(() => (scope.data?.by_command ?? [])
    .map((c) => ({ c, alert: strengthAlert(c.active, c.authorised) ?? activeRatioAlert(c.active, c.count) }))
    .filter((x) => x.alert), [scope.data]);
  const commandName = unitId ? scope.data?.by_command.find((c) => c.id === unitId)?.name : null;
  const deptName = deptId ? scope.data?.by_department.find((d) => d.id === deptId)?.name : null;

  const intakeOptions = useMemo(
    () => Array.from(new Set((a?.staff ?? []).map((s) => s.intake).filter((v): v is number => v != null))).sort((x, y) => x - y),
    [a]
  );
  const intakeCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of a?.staff ?? []) if (s.intake != null) m.set(s.intake, (m.get(s.intake) ?? 0) + 1);
    return Array.from(m, ([intake, count]) => ({ label: `Intake ${intake}`, count, intake: String(intake) }));
  }, [a]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (a?.staff ?? []).filter((s) =>
      (!q || `${s.name} ${s.staff_id} ${s.rank} ${s.command} ${s.department} ${s.intake ?? ""}`.toLowerCase().includes(q)) &&
      (intakeFilter === "all" || String(s.intake ?? "") === intakeFilter));
  }, [a, search, intakeFilter]);

  const doExport = async (fmt: ExportFormat) => {
    const title = `Staff Analytics — ${commandName ?? "All commands in scope"}${deptName ? ` / ${deptName}` : ""}`;
    await exportReport(fmt, {
      title,
      filename: `staff-analytics-${Date.now()}`,
      subtitle: `Total ${a?.total ?? 0} · Active ${a?.active ?? 0}`,
      headers: ["Staff ID", "Name", "Sex", "Rank", "Role(s)", "Department", "Command", "Region", "Intake", "Status"],
      rows: rows.map((s) => [s.staff_id ?? "", s.name, s.sex, s.rank, s.roles, s.department, s.command, s.region, s.intake != null ? String(s.intake) : "", pretty(s.status)]),
    } as never);
    void logAdminAudit("staff_analytics", `exported_${fmt}`, { unitId, deptId, rows: rows.length });
  };

  const doExportBreakdowns = async (fmt: "pdf" | "csv") => {
    if (!a) return;
    const title = `Aggregate Breakdowns — ${commandName ?? "All commands in scope"}${deptName ? ` / ${deptName}` : ""}`;
    const sections: [string, Record<string, number>][] = [
      ["Sex", a.by_sex], ["Status", a.by_status], ["Rank", a.by_rank],
      ["Role", a.by_role], ["Region", a.by_region],
      ["Intake", Object.fromEntries(intakeCounts.map((c) => [c.label, c.count]))],
      ["Department", Object.fromEntries(a.by_department.map((d) => [d.name, d.count]))],
      ["Command", Object.fromEntries(a.by_command.map((c) => [c.name, c.count]))],
    ];
    const rows = sections.flatMap(([section, data]) =>
      Object.entries(data ?? {}).sort((x, y) => y[1] - x[1])
        .map(([k, v]) => [section, pretty(k), String(v)]));
    await exportReport(fmt, {
      title,
      filename: `analytics-breakdowns-${Date.now()}`,
      subtitle: `Total ${a.total} · Active ${a.active}`,
      headers: ["Breakdown", "Category", "Staff"],
      rows,
    } as never);
    void logAdminAudit("staff_analytics", `exported_breakdowns_${fmt}`, { unitId, deptId, rows: rows.length });
  };

  const doPrint = () => {
    void logAdminAudit("staff_analytics", "printed", { unitId, deptId });
    window.print();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.rpc("soft_delete_staff", { _ids: [toDelete.id], _reason: reason.trim() } as never);
    if (error) toast({ title: "Delete refused", description: error.message, variant: "destructive" });
    else { toast({ title: "Record moved to Deleted Records" }); view.refetch(); scope.refetch(); }
    setToDelete(null); setReason("");
  };

  if (view.error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">You are not authorised to view these analytics.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {unitId && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/command-analytics")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> All commands
            </Button>
          )}
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
            {commandName ? `${commandName} — Analytics` : "Command & Department Analytics"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live staff figures for the commands in your reach. Updates automatically
            {view.dataUpdatedAt ? ` · last updated ${new Date(view.dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}.
            <span className="ml-1 inline-flex items-center gap-1 text-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />Live</span>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {perms.canPrint && <Button variant="outline" size="sm" onClick={doPrint}><Printer className="mr-1 h-4 w-4" />Print</Button>}
          {perms.canDownload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm"><Download className="mr-1 h-4 w-4" />Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["pdf", "excel", "word", "csv"] as ExportFormat[]).map((f) => (
                  <DropdownMenuItem key={f} onClick={() => doExport(f)}>{f.toUpperCase()}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {perms.canDownload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />Breakdowns</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExportBreakdowns("pdf")}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExportBreakdowns("csv")}>CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile title="Total staff" value={a?.total ?? "—"} icon={Users} accent={2}
          trend={scopeTotalPrev != null && a && !deptId ? a.total - scopeTotalPrev : null} />
        <KpiTile title="Active" value={a?.active ?? "—"} icon={UserCheck} tone="success"
          sub={a && a.total ? `${Math.round((a.active / a.total) * 100)}% of strength` : undefined}
          alert={a ? activeRatioAlert(a.active, a.total) : null} />
        <KpiTile title="Commands" value={scope.data?.by_command.length ?? "—"} icon={Network} tone="info" />
        <KpiTile title="Departments" value={scope.data?.by_department.length ?? "—"} icon={Building2} tone="warning" />
      </div>

      {alerts.length > 0 && (
        <section aria-label="Automatic alerts" className="rounded-lg border-2 border-warning/40 bg-warning/5 p-3">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">Automatic alerts ({alerts.length})</h2>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {alerts.slice(0, 8).map(({ c, alert }) => (
              <li key={c.id ?? c.name} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${alert!.level === "danger" ? "bg-destructive" : "bg-warning"}`} aria-hidden="true" />
                {c.id ? <Link className="font-medium underline-offset-2 hover:underline" to={`/command-analytics/${c.id}`}>{c.name}</Link> : <span className="font-medium">{c.name}</span>}
                <span className="text-muted-foreground">— {alert!.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Commands — select one for its own dashboard</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(scope.data?.by_command ?? []).map((c) => (
            <KpiTile key={c.id ?? "none"} title={c.name} value={c.count}
              sub={`${c.active} active${c.authorised ? ` · ${c.authorised} authorised` : ""}`}
              icon={Network} accent={accentFor(c.id ?? c.name)} selected={c.id === unitId}
              alert={strengthAlert(c.active, c.authorised) ?? activeRatioAlert(c.active, c.count)}
              trend={c.id && baseline[c.id] ? c.count - baseline[c.id].total : null}
              onClick={c.id ? () => navigate(`/command-analytics/${c.id}`) : undefined} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          Departments — select to filter
          {deptId && <Button variant="ghost" size="sm" onClick={() => setDeptId(null)}><X className="mr-1 h-3 w-3" />Clear {deptName}</Button>}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(scope.data?.by_department ?? []).map((d) => (
            <KpiTile key={d.id ?? "none"} title={d.name} value={d.count} sub={`${d.active} active`}
              icon={Building2} accent={accentFor(d.id ?? d.name)} selected={d.id === deptId}
              alert={activeRatioAlert(d.active, d.count)}
              onClick={d.id ? () => setDeptId(d.id === deptId ? null : d.id) : undefined} />
          ))}
        </div>
      </section>

      {view.isLoading ? <p className="text-sm text-muted-foreground">Loading analytics…</p> : a && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Breakdown title="By sex" data={a.by_sex} />
          <Breakdown title="By status" data={a.by_status} />
          <Breakdown title="By rank" data={a.by_rank} />
          <Breakdown title="By role" data={a.by_role} />
          <Breakdown title="By region" data={a.by_region} />
          <Breakdown title="By department" data={Object.fromEntries(a.by_department.map((d) => [d.name, d.count]))} />
          <Breakdown title="By command" data={Object.fromEntries(a.by_command.map((d) => [d.name, d.count]))} />
        </div>
      )}

      {a && intakeCounts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CardTitle className="flex-1 text-sm">Intake distribution</CardTitle>
            {intakeFilter !== "all" && (
              <Button variant="ghost" size="sm" className="h-7 text-xs print:hidden" onClick={() => setIntakeFilter("all")}>
                <X className="mr-1 h-3 w-3" />Showing {intakeFilter === "" ? "no intake" : `Intake ${intakeFilter}`}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intakeCounts} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Staff"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    className="cursor-pointer"
                    onClick={(d: { intake?: string }) => d?.intake && setIntakeFilter(d.intake === intakeFilter ? "all" : d.intake)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground print:hidden">Click a bar to filter the staff list to that intake.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <CardTitle className="flex-1 text-sm">Staff records ({rows.length})</CardTitle>
          <Select value={intakeFilter} onValueChange={setIntakeFilter}>
            <SelectTrigger className="h-8 w-[130px] print:hidden"><SelectValue placeholder="Intake" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Intakes</SelectItem>
              {intakeOptions.map((v) => (
                <SelectItem key={v} value={String(v)}>Intake {v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Search name, ID, rank…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 max-w-xs print:hidden" />
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground">
              <tr><th className="p-2">Staff ID</th><th>Name</th><th>Sex</th><th>Rank</th><th>Role(s)</th><th>Department</th><th>Command</th><th>Intake</th><th>Status</th><th className="print:hidden" /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.staff_id}</td><td>{s.name}</td><td>{s.sex}</td><td>{s.rank}</td>
                  <td>{pretty(s.roles)}</td><td>{s.department}</td><td>{s.command}</td><td>{s.intake ?? "—"}</td>
                  <td><Badge variant={s.status === "active" ? "default" : "secondary"}>{pretty(s.status)}</Badge></td>
                  <td className="whitespace-nowrap print:hidden">
                    <Button asChild variant="ghost" size="icon" aria-label="Open record"><Link to={`/staff?edit=${s.id}`}>{perms.canEdit ? <Pencil className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}</Link></Button>
                    {perms.canDelete && (
                      <Button variant="ghost" size="icon" aria-label="Delete record" onClick={() => setToDelete(s)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The record moves to Deleted Records and can be restored. A reason is required.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (at least 4 characters)" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={reason.trim().length < 4} onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
