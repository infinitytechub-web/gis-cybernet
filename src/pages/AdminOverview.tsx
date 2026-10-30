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
import { Briefcase, FileDown, LayoutDashboard, Users } from "lucide-react";

const RANGES: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "365": 365, all: null };
const since = (r: string) => (RANGES[r] ? new Date(Date.now() - RANGES[r]! * 864e5).toISOString() : null);
const count = (rows: { status?: string | null }[] | undefined) => {
  const m: Record<string, number> = {};
  (rows ?? []).forEach((r) => { const s = r.status ?? "unknown"; m[s] = (m[s] ?? 0) + 1; });
  return m;
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
  const from = since(range);

  const commands = useQuery({
    queryKey: ["admin-overview-commands"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("regional_commands_overview");
      if (error) throw error;
      return (data ?? []) as RegionalCommandCard[];
    },
    refetchInterval: 60_000,
  });

  const q = <T,>(key: string, fn: () => Promise<T>) =>
    useQuery({ queryKey: ["admin-overview", key, range, command], queryFn: fn, refetchInterval: 60_000 });

  const withRange = (b: any, col = "created_at") => (from ? b.gte(col, from) : b);

  const apps = q("apps", async () => {
    let b: any = supabase.from("staff_applications").select("status,application_type,target_org_unit_id");
    b = withRange(b);
    if (command !== "all") b = b.eq("target_org_unit_id", command);
    const { data, error } = await b.limit(5000);
    if (error) throw error;
    return data as { status: string; application_type: string }[];
  });
  const transfers = q("transfers", async () => {
    let b: any = supabase.from("staff_transfer_requests").select("status,to_org_unit_id,from_org_unit_id");
    b = withRange(b);
    if (command !== "all") b = b.or(`to_org_unit_id.eq.${command},from_org_unit_id.eq.${command}`);
    const { data, error } = await b.limit(5000);
    if (error) throw error;
    return data as { status: string }[];
  });
  const hr = q("hr", async () => {
    const run = async (t: "staff_appointments" | "staff_promotions" | "staff_exits") => {
      let b: any = supabase.from(t).select(t === "staff_appointments" ? "id,org_unit_id" : "status");
      b = withRange(b);
      if (t === "staff_appointments" && command !== "all") b = b.eq("org_unit_id", command);
      const { data, error } = await b.limit(5000);
      if (error) throw error;
      return data as any[];
    };
    const [appointments, promotions, exits] = await Promise.all([run("staff_appointments"), run("staff_promotions"), run("staff_exits")]);
    return { appointments, promotions, exits };
  });
  const kyc = q("kyc", async () => {
    let b: any = supabase.from("hrm_export_audit").select("id,format,subject,row_count,created_at").eq("export_kind", "kyc_profiles").order("created_at", { ascending: false });
    b = withRange(b);
    const { data, error } = await b.limit(500);
    if (error) throw error;
    return data as { id: string; format: string; subject: string | null; row_count: number | null; created_at: string }[];
  });

  const cmdList = commands.data ?? [];
  const shownCmds = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cmdList.filter((c) => (command === "all" || c.id === command) && (!s || c.name.toLowerCase().includes(s)));
  }, [cmdList, command, search]);
  const staffTotal = shownCmds.reduce((n, c) => n + (c.staff_count ?? 0), 0);
  const kycRows = kyc.data ?? [];
  const kycRecords = kycRows.reduce((n, r) => n + (r.row_count ?? 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">HR, staff applications, KYC downloads and command dashboards in one place. Figures only include records you are allowed to see.</p>
      </div>

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
          <SelectTrigger className="w-64" aria-label="Command"><SelectValue placeholder="All commands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All commands</SelectItem>
            {cmdList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="w-56" placeholder="Search commands…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search commands" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Totals title="Staff in commands" total={staffTotal} icon={Users} note={`${shownCmds.length} command(s)`} to="/regional-commands" />
        <Totals title="Staff applications" total={apps.isError ? "—" : apps.data?.length ?? "…"} parts={count(apps.data)} icon={Briefcase} to="/hr/applications" />
        <Totals title="Transfer requests" total={transfers.isError ? "—" : transfers.data?.length ?? "…"} parts={count(transfers.data)} icon={Briefcase} to="/hr/applications" />
        <Totals title="KYC downloads" total={kyc.isError ? "—" : kycRows.length} icon={FileDown} note={kyc.isError ? "Super Admins only" : `${kycRecords} staff records exported`} />
      </div>

      <CommandApprovalQueue />

      <Card>
        <CardHeader><CardTitle className="text-base">HR service records</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Totals title="Appointments" total={hr.data?.appointments.length ?? (hr.isError ? "—" : "…")} icon={Users} to="/hr" />
          <Totals title="Promotions" total={hr.data?.promotions.length ?? (hr.isError ? "—" : "…")} parts={count(hr.data?.promotions)} icon={Users} />
          <Totals title="Resignations & exits" total={hr.data?.exits.length ?? (hr.isError ? "—" : "…")} parts={count(hr.data?.exits)} icon={Users} />
        </CardContent>
      </Card>

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
                    <div className="text-xs text-muted-foreground">{c.staff_count ?? 0} staff · {c.activation_status === "active" ? "Active" : "Paused"}</div>
                  </div>
                  {path && <Button asChild size="sm" variant="outline"><Link to={path}><LayoutDashboard className="mr-1 h-4 w-4" />Dashboard</Link></Button>}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent KYC downloads</CardTitle></CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {kyc.isError && <p className="text-sm text-muted-foreground">Only Super Admins can view the KYC download history.</p>}
            {!kyc.isError && kycRows.length === 0 && <p className="text-sm text-muted-foreground">No KYC downloads in this period.</p>}
            {kycRows.slice(0, 25).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{r.subject || "Staff selection"} · {r.row_count ?? 0} records · {r.format.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
