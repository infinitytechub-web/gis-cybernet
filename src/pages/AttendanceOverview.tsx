/**
 * Attendance Overview — hours worked and leave summary for a chosen date range.
 *
 * Hours worked are computed in the database from each recorded clock-in /
 * clock-out pair (capped at 24h per day to absorb bad data). The RPC scopes
 * rows itself: command tier sees every staff member, everyone else sees only
 * their own figures, so no extra client-side filtering is needed.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, FileSpreadsheet, Timer, UserCheck, UserX, AlarmClock, PlaneTakeoff } from "lucide-react";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCellQuoted } from "@/lib/csv-safe";
import { formatDate } from "@/lib/date-format";
import { format, startOfMonth, subDays } from "date-fns";
import { Link } from "react-router-dom";

interface SummaryRow {
  profile_id: string;
  staff_name: string | null;
  staff_id: string | null;
  department: string | null;
  days_present: number;
  days_late: number;
  days_absent: number;
  days_excused: number;
  open_sessions: number;
  hours_worked: number;
  first_date: string | null;
  last_date: string | null;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export default function AttendanceOverview() {
  const { isAdminOrSupervisor } = useAuth();
  const today = new Date();
  const [from, setFrom] = useState(iso(startOfMonth(today)));
  const [to, setTo] = useState(iso(today));

  const rangeValid = !!from && !!to && from <= to;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance-hours-summary", from, to],
    enabled: rangeValid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("attendance_hours_summary", {
        _from: from,
        _to: to,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SummaryRow[];
    },
  });

  const { data: leave = [] } = useQuery({
    queryKey: ["attendance-overview-leave", from, to],
    enabled: rangeValid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, type, status, start_date, end_date")
        .lte("start_date", to)
        .gte("end_date", from);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const t = {
      hours: 0, present: 0, late: 0, absent: 0, excused: 0, open: 0, staff: rows.length,
    };
    for (const r of rows) {
      t.hours += Number(r.hours_worked ?? 0);
      t.present += r.days_present;
      t.late += r.days_late;
      t.absent += r.days_absent;
      t.excused += r.days_excused;
      t.open += r.open_sessions;
    }
    return t;
  }, [rows]);

  const leaveCounts = useMemo(() => ({
    pending: leave.filter((l) => l.status === "pending").length,
    approved: leave.filter((l) => l.status === "approved").length,
    rejected: leave.filter((l) => l.status === "rejected").length,
  }), [leave]);

  const applyPreset = (days: number | "month") => {
    if (days === "month") {
      setFrom(iso(startOfMonth(today)));
    } else {
      setFrom(iso(subDays(today, days - 1)));
    }
    setTo(iso(today));
  };

  const exportCsv = () => {
    const header = ["Staff", "Staff ID", "Department", "Hours worked", "Present", "Late", "Absent", "Excused", "Not clocked out", "First day", "Last day"];
    const lines = [header.map(csvCellQuoted).join(",")];
    for (const r of rows) {
      lines.push([
        r.staff_name ?? "", r.staff_id ?? "", r.department ?? "",
        String(r.hours_worked ?? 0), String(r.days_present), String(r.days_late),
        String(r.days_absent), String(r.days_excused), String(r.open_sessions),
        r.first_date ? formatDate(r.first_date) : "", r.last_date ? formatDate(r.last_date) : "",
      ].map(csvCellQuoted).join(","));
    }
    downloadCSVString(lines.join("\n"), `attendance-overview-${from}_${to}.csv`);
  };

  const stats = [
    { label: "Hours worked", value: totals.hours.toFixed(2), icon: Timer },
    { label: "Days present", value: totals.present, icon: UserCheck },
    { label: "Late arrivals", value: totals.late, icon: AlarmClock },
    { label: "Absences", value: totals.absent, icon: UserX },
    { label: "Still clocked in", value: totals.open, icon: CalendarClock },
    { label: "Leave (pending)", value: leaveCounts.pending, icon: PlaneTakeoff },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="Attendance Overview"
        subtitle={isAdminOrSupervisor
          ? "Hours worked, attendance and leave across the unit for any date range"
          : "Your hours worked, attendance and leave for any date range"}
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date range</CardTitle>
          <CardDescription>Hours are counted from each recorded clock-in and clock-out.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="att-from">From</Label>
            <Input id="att-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-to">To</Label>
            <Input id="att-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => applyPreset(7)}>Last 7 days</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(30)}>Last 30 days</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("month")}>This month</Button>
          </div>
          {!rangeValid && <p className="text-sm text-destructive">Choose a valid date range.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <s.icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">{s.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-secondary">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Leave requests in this range
            <Badge variant="secondary">{leave.length}</Badge>
          </CardTitle>
          <CardDescription>
            Approvals are handled on the <Link className="underline" to="/leave">Leave / Pass Requests</Link> page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Pending: {leaveCounts.pending}</Badge>
          <Badge>Approved: {leaveCounts.approved}</Badge>
          <Badge variant="destructive">Rejected: {leaveCounts.rejected}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Hours worked {isAdminOrSupervisor ? `by staff (${rows.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Excused</TableHead>
                  <TableHead className="text-right">Not clocked out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9}>Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9}>No attendance recorded in this range.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.profile_id}>
                    <TableCell className="font-medium">{r.staff_name ?? "—"}</TableCell>
                    <TableCell>{r.staff_id ?? "—"}</TableCell>
                    <TableCell>{r.department ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{Number(r.hours_worked ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.days_present}</TableCell>
                    <TableCell className="text-right">{r.days_late}</TableCell>
                    <TableCell className="text-right">{r.days_absent}</TableCell>
                    <TableCell className="text-right">{r.days_excused}</TableCell>
                    <TableCell className="text-right">{r.open_sessions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
