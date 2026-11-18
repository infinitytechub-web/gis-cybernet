import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import { CalendarClock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAttendanceReportSync } from "@/hooks/useAttendanceReportSync";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { usePagedList } from "@/hooks/usePagedList";
import { attendanceTotals, attendanceCommandMonths, fetchAttendanceReport, recordedHours, type AttendanceReportRow } from "@/lib/attendance-report";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AttendanceReport() {
  useAttendanceReportSync();
  const { user } = useAuth();
  const { formatStaffId } = useStaffIdDisplay("directory");
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [command, setCommand] = useState("all");
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const valid = !!from && !!to && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 366;
  const report = useQuery({
    queryKey: ["attendance-report", user?.id, from, to], enabled: !!user && valid,
    refetchInterval: 60_000,
    queryFn: () => fetchAttendanceReport(async (start, end) => {
      const { data, error } = await supabase.rpc("attendance_report_rows", { _from: from, _to: to }).range(start, end);
      if (error) throw error;
      return (data ?? []) as AttendanceReportRow[];
    }),
  });
  const commands = useMemo(() => [...new Map((report.data ?? []).map((r) => [r.org_unit_id ?? "unassigned", r.command_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [report.data]);
  const months = useMemo(() => [...new Set((report.data ?? []).map((r) => r.date.slice(0, 7)))].sort().reverse(), [report.data]);
  const filtered = useMemo(() => (report.data ?? []).filter((r) =>
    (command === "all" || (r.org_unit_id ?? "unassigned") === command) &&
    (month === "all" || r.date.startsWith(month)) &&
    `${r.staff_name} ${formatStaffId(r.staff_id, { ownerUserId: r.owner_user_id })}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [report.data, command, month, search, formatStaffId]);
  const totals = useMemo(() => attendanceTotals(filtered), [filtered]);
  const grouped = useMemo(() => attendanceCommandMonths(filtered), [filtered]);
  const key = `${from}|${to}|${command}|${month}|${search}`;
  const historyPager = usePagedList(filtered, { resetKey: key });
  const summaryPager = usePagedList(grouped, { resetKey: key });
  const unavailable = !valid || report.isError;
  const monthLabel = (value: string) => format(new Date(`${value}-01T12:00:00`), "MMMM yyyy");
  const empty = unavailable ? "Report unavailable. Check the dates and try again." : report.isPending ? "Loading attendance…" : "No attendance records match these filters.";

  return <div className="space-y-5">
    <PageHeader title="Attendance Report" icon={CalendarClock} actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/attendance/overview">Attendance Overview</Link></Button><Button variant="outline" size="sm" onClick={() => void report.refetch()} disabled={!valid || report.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1"><Label htmlFor="report-from">From</Label><DateInput id="report-from" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setMonth("all"); }} /></div>
      <div className="space-y-1"><Label htmlFor="report-to">To</Label><DateInput id="report-to" value={to} min={from} onChange={(e) => { setTo(e.target.value); setMonth("all"); }} /></div>
      <div className="min-w-0 space-y-1"><Label>Command / unit</Label><Select value={command} onValueChange={setCommand}><SelectTrigger aria-label="Filter command"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All authorized commands</SelectItem>{commands.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Month</Label><Select value={month} onValueChange={setMonth}><SelectTrigger aria-label="Filter month"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All months in range</SelectItem>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="report-search">Officer</Label><Input id="report-search" placeholder="Search officer or visible staff ID" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    </div>
    {!valid && <p role="alert" className="text-sm text-destructive">Choose a valid range of up to 367 days.</p>}
    {report.isError && <p role="alert" className="text-sm text-destructive">Attendance could not be loaded. Refresh to retry.</p>}
    <p role="status" className="text-xs text-muted-foreground">{report.isFetching ? "Updating…" : report.dataUpdatedAt ? `Last updated ${formatDateTime(new Date(report.dataUpdatedAt).toISOString())}` : "Awaiting attendance records"}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["Officers", totals.officers], ["Clock-ins", totals.clockIns], ["Clock-outs", totals.clockOuts], ["Recorded hours", totals.hours.toFixed(2)], ["Not clocked out", totals.open]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-primary">{unavailable ? "—" : report.isPending ? "…" : value}</p></CardContent></Card>)}</div>
    {totals.invalid > 0 && !unavailable && <p className="text-sm text-destructive" role="alert">{totals.invalid} invalid clock pairs excluded from recorded hours.</p>}
    <Tabs defaultValue="history"><TabsList><TabsTrigger value="history">Officer history</TabsTrigger><TabsTrigger value="totals">Command & month totals</TabsTrigger></TabsList>
      <TabsContent value="history" className="space-y-3"><div className="max-h-[65vh] overflow-auto"><Table className="min-w-[850px]"><TableHeader><TableRow>{["Officer", "Command / unit", "Date", "Clock-in", "Clock-out", "Hours", "Status"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{(unavailable || historyPager.pageItems.length === 0) ? <TableRow><TableCell colSpan={7}>{empty}</TableCell></TableRow> : historyPager.pageItems.map((r) => <TableRow key={r.id}><TableCell className="font-medium">{r.staff_name}<div className="text-xs text-muted-foreground">{formatStaffId(r.staff_id, { ownerUserId: r.owner_user_id })}</div></TableCell><TableCell>{r.command_name}</TableCell><TableCell>{formatDate(r.date)}</TableCell><TableCell>{r.check_in ? formatDateTime(r.check_in) : "Not recorded"}</TableCell><TableCell>{r.check_out ? formatDateTime(r.check_out) : r.check_in ? "Not clocked out" : "Not recorded"}</TableCell><TableCell>{recordedHours(r)?.toFixed(2) ?? "—"}</TableCell><TableCell className="capitalize">{r.status}</TableCell></TableRow>)}</TableBody></Table></div>{!unavailable && <ListPagination {...historyPager} label="attendance records" />}</TabsContent>
      <TabsContent value="totals" className="space-y-3"><div className="max-h-[65vh] overflow-auto"><Table className="min-w-[700px]"><TableHeader><TableRow>{["Command / unit", "Month", "Officers", "Records", "Clock-ins", "Clock-outs", "Hours", "Open sessions"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{(unavailable || summaryPager.pageItems.length === 0) ? <TableRow><TableCell colSpan={8}>{empty}</TableCell></TableRow> : summaryPager.pageItems.map((r) => <TableRow key={r.key}><TableCell>{r.command}</TableCell><TableCell>{monthLabel(r.month)}</TableCell><TableCell>{r.officers}</TableCell><TableCell>{r.records}</TableCell><TableCell>{r.clockIns}</TableCell><TableCell>{r.clockOuts}</TableCell><TableCell>{r.hours.toFixed(2)}</TableCell><TableCell>{r.open}</TableCell></TableRow>)}</TableBody></Table></div>{!unavailable && <ListPagination {...summaryPager} label="command monthly totals" />}</TabsContent>
    </Tabs>
  </div>;
}