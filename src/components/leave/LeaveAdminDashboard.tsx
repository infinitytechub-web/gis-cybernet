import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, CheckCircle2, XCircle, CalendarOff, Search } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { LeaveApprovalQueue } from "./LeaveApprovalQueue";

const SHIFT_GROUPS = ["A", "B", "C", "D"] as const;

export function LeaveAdminDashboard() {
  const [tab, setTab] = useState<"overview" | "queue">("overview");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-light"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["leave-admin-dashboard", deptFilter, shiftFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("leave_requests")
        .select("id, type, status, start_date, end_date, reason, created_at, department_id, shift_group, profiles(first_name, last_name, staff_id)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (deptFilter !== "all") q = q.eq("department_id", deptFilter);
      if (shiftFilter !== "all") q = q.eq("shift_group", shiftFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as "pending" | "approved" | "rejected");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r: any) => {
      const name = `${r.profiles?.last_name ?? ""} ${r.profiles?.first_name ?? ""} ${r.profiles?.staff_id ?? ""}`.toLowerCase();
      return name.includes(s);
    });
  }, [rows, search]);

  const counts = useMemo(() => {
    const c = { total: rows.length, pending: 0, approved: 0, rejected: 0 };
    rows.forEach((r: any) => {
      if (r.status === "pending") c.pending++;
      else if (r.status === "approved") c.approved++;
      else if (r.status === "rejected") c.rejected++;
    });
    return c;
  }, [rows]);

  const deptName = (id?: string | null) =>
    id ? departments.find((d: any) => d.id === id)?.name ?? "—" : "—";

  const statusColor = (s: string) =>
    s === "approved" ? "bg-emerald-100 text-emerald-800"
    : s === "rejected" ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "queue" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("queue")}
        >
          Approval Queue
        </button>
      </div>

      {tab === "queue" ? (
        <LeaveApprovalQueue />
      ) : (
        <>
          {/* Stat cards — click to filter by status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { key: "all", label: "Total", value: counts.total, Icon: CalendarOff, tone: "text-primary" },
              { key: "pending", label: "Pending", value: counts.pending, Icon: Clock, tone: "text-amber-600" },
              { key: "approved", label: "Approved", value: counts.approved, Icon: CheckCircle2, tone: "text-emerald-600" },
              { key: "rejected", label: "Rejected", value: counts.rejected, Icon: XCircle, tone: "text-destructive" },
            ] as const).map(({ key, label, value, Icon, tone }) => (
              <Card
                key={key}
                role="button"
                tabIndex={0}
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatusFilter(key); } }}
                className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusFilter === key ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${tone}`} />
                  <div>
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>


          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search staff name or ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="md:w-[200px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger className="md:w-[140px]"><SelectValue placeholder="Shift" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shifts</SelectItem>
                {SHIFT_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>Shift {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave requests match these filters</TableCell></TableRow>
                ) : (
                  filtered.map((r: any) => {
                    const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</div>
                          <div className="text-xs text-muted-foreground">{r.profiles?.staff_id}</div>
                        </TableCell>
                        <TableCell className="text-sm">{deptName(r.department_id)}</TableCell>
                        <TableCell className="text-sm">{r.shift_group ?? "—"}</TableCell>
                        <TableCell className="capitalize text-sm">{r.type}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(r.start_date), "dd MMM")} – {format(new Date(r.end_date), "dd/MM/yy")}
                        </TableCell>
                        <TableCell>{days}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
