import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateInput } from "@/components/ui/date-input";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/date-format";
import { LEAVE_TYPE_LABELS } from "@/lib/leave-reasons";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

const db = supabase as any;
const ALL = "__all";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type CommandRow = { org_unit_id: string | null; command_name: string; pending: number; approved: number; rejected: number; approved_days: number };
type LeaveRow = {
  id: string; type: string; status: string; start_date: string; end_date: string; reason_category: string | null;
  profiles: { first_name: string; last_name: string; staff_id: string | null; org_unit_id: string | null } | null;
};

const statusVariant = (s: string) => (s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary") as any;

export default function CommandLeaveDashboard() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), 0, 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), 11, 31)));
  const [command, setCommand] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [day, setDay] = useState<string | null>(null);

  const totals = useQuery({
    queryKey: ["command-leave-dashboard", from, to],
    refetchInterval: 60_000,
    queryFn: async (): Promise<CommandRow[]> => {
      const { data, error } = await db.rpc("command_leave_dashboard", { p_from: from, p_to: to, p_org_unit: null });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, pending: Number(r.pending), approved: Number(r.approved), rejected: Number(r.rejected), approved_days: Number(r.approved_days) }));
    },
  });

  const list = useQuery({
    queryKey: ["command-leave-requests", from, to],
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await db
        .from("leave_requests")
        .select("id, type, status, start_date, end_date, reason_category, profiles!inner(first_name, last_name, staff_id, org_unit_id, deleted_at)")
        .is("profiles.deleted_at", null)
        .lte("start_date", to).gte("end_date", from)
        .order("start_date", { ascending: false })
        .range(0, 4999);
      if (error) throw error;
      return data ?? [];
    },
  });

  const commandRows = totals.data ?? [];
  const visibleCommands = command === ALL ? commandRows : commandRows.filter((r) => (r.org_unit_id ?? "none") === command);
  const sum = visibleCommands.reduce((a, r) => ({ pending: a.pending + r.pending, approved: a.approved + r.approved, rejected: a.rejected + r.rejected, days: a.days + r.approved_days }), { pending: 0, approved: 0, rejected: 0, days: 0 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((r) => {
      if (command !== ALL && (r.profiles?.org_unit_id ?? "none") !== command) return false;
      if (status !== ALL && r.status !== status) return false;
      if (type !== ALL && r.type !== type) return false;
      if (day && !(r.start_date <= day && r.end_date >= day)) return false;
      if (!q) return true;
      return `${r.profiles?.first_name} ${r.profiles?.last_name} ${r.profiles?.staff_id} ${r.reason_category ?? ""}`.toLowerCase().includes(q);
    });
  }, [list.data, command, status, type, search, day]);
  const pager = usePagedList(filtered, { resetKey: `${command}|${status}|${type}|${search}|${day}` });

  // Calendar: approved and pending leave per day in the visible month.
  const calendarSource = (list.data ?? []).filter((r) => (command === ALL || (r.profiles?.org_unit_id ?? "none") === command) && r.status !== "rejected");
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (month.getDay() + 6) % 7;
  const cells = Array.from({ length: lead + daysInMonth }, (_, i) => (i < lead ? null : iso(new Date(month.getFullYear(), month.getMonth(), i - lead + 1))));
  const countFor = (d: string) => {
    let approved = 0, pending = 0;
    for (const r of calendarSource) if (r.start_date <= d && r.end_date >= d) r.status === "approved" ? approved++ : pending++;
    return { approved, pending };
  };

  const loading = totals.isLoading || list.isLoading;
  const failed = totals.isError || list.isError;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Command Leave Dashboard</h1>
          <p className="text-sm text-muted-foreground">Pending, approved and rejected leave for the commands you are authorised to see.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/leave/approvals">Review requests</Link></Button>
          <Button variant="outline" size="sm" onClick={() => { void totals.refetch(); void list.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <Card><CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="ld-from">From</Label><DateInput id="ld-from" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="ld-to">To</Label><DateInput id="ld-to" value={to} onChange={(e) => setTo(e.target.value)} min={from} /></div>
        <div><Label>Command</Label>
          <Select value={command} onValueChange={setCommand}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value={ALL}>All my commands</SelectItem>
            {commandRows.map((r) => <SelectItem key={r.org_unit_id ?? "none"} value={r.org_unit_id ?? "none"}>{r.command_name}</SelectItem>)}
          </SelectContent></Select></div>
        <div><Label>Status</Label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent></Select></div>
        <div><Label>Leave type</Label>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent></Select></div>
      </CardContent></Card>

      {failed && <div role="alert" className="text-destructive">Leave figures could not be loaded. <Button size="sm" variant="outline" onClick={() => { void totals.refetch(); void list.refetch(); }}>Retry</Button></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Pending", sum.pending], ["Approved", sum.approved], ["Rejected", sum.rejected], ["Approved days", sum.days]].map(([label, value]) => (
          <Card key={label as string}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold text-primary">{loading ? "…" : value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By command</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Command</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Rejected</TableHead></TableRow></TableHeader>
              <TableBody>
                {commandRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{loading ? "Loading…" : "No leave requests in this period"}</TableCell></TableRow>}
                {commandRows.map((r) => (
                  <TableRow key={r.org_unit_id ?? "none"} className="cursor-pointer" onClick={() => setCommand(r.org_unit_id ?? "none")} data-state={command === (r.org_unit_id ?? "none") ? "selected" : undefined}>
                    <TableCell>{r.command_name}</TableCell><TableCell className="text-right">{r.pending}</TableCell><TableCell className="text-right">{r.approved}</TableCell><TableCell className="text-right">{r.rejected}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const c = countFor(d);
                return (
                  <button key={d} type="button" onClick={() => setDay(day === d ? null : d)} aria-label={`${formatDate(d)}: ${c.approved} approved, ${c.pending} pending`}
                    className={`min-h-12 rounded border p-1 text-left text-xs ${day === d ? "border-primary bg-primary/10" : "border-border"}`}>
                    <div className="font-medium">{Number(d.slice(8))}</div>
                    {c.approved > 0 && <div className="text-primary">{c.approved} on leave</div>}
                    {c.pending > 0 && <div className="text-muted-foreground">{c.pending} pending</div>}
                  </button>
                );
              })}
            </div>
            {day && <p className="mt-2 text-xs text-muted-foreground">Showing officers away on {formatDate(day)}. <button className="underline" onClick={() => setDay(null)}>Clear</button></p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Leave requests</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search name, staff ID or reason…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leave requests" />
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {pager.pageItems.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{loading ? "Loading…" : "No matching leave requests"}</TableCell></TableRow>}
                {pager.pageItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.profiles?.first_name} {r.profiles?.last_name}<div className="text-xs text-muted-foreground">{r.profiles?.staff_id}</div></TableCell>
                    <TableCell>{LEAVE_TYPE_LABELS[r.type] ?? r.type}</TableCell>
                    <TableCell>{r.reason_category ?? "Not specified"}</TableCell>
                    <TableCell>{formatDate(r.start_date)} – {formatDate(r.end_date)}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)} className="capitalize">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
          </div>
          <ListPagination {...pager} label="leave requests" />
        </CardContent>
      </Card>
    </div>
  );
}
