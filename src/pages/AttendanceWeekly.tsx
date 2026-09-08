/**
 * Weekly Attendance Dashboard — one row per staff member, one column per day of
 * the chosen week, showing clock-in / clock-out times and hours worked, plus
 * leave requests overlapping the week, weekly totals and a CSV export.
 *
 * Row visibility comes from the database policies on `attendances`:
 * command tier sees the whole unit, everyone else sees only their own record.
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
import { CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, PlaneTakeoff, Timer } from "lucide-react";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCellQuoted } from "@/lib/csv-safe";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, parseISO } from "date-fns";
import { Link } from "react-router-dom";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const MAX_DAILY_HOURS = 16;

interface AttendanceRow {
  id: string;
  profile_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  profiles: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
}

interface LeaveRow {
  id: string;
  profile_id: string;
  type: string;
  status: string;
  start_date: string;
  end_date: string;
  profiles: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
}

const hoursBetween = (inAt: string | null, outAt: string | null) => {
  if (!inAt || !outAt) return 0;
  const ms = new Date(outAt).getTime() - new Date(inAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / 3_600_000, MAX_DAILY_HOURS);
};

const clock = (ts: string | null) => (ts ? format(new Date(ts), "HH:mm") : "—");
const nameOf = (p: { first_name: string | null; last_name: string | null } | null) =>
  `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();

export default function AttendanceWeekly() {
  const { isAdminOrSupervisor } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const from = iso(weekStart);
  const to = iso(endOfWeek(weekStart, { weekStartsOn: 1 }));
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["attendance-weekly", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("id, profile_id, date, check_in, check_out, status, profiles(first_name, last_name, staff_id)")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AttendanceRow[];
    },
  });

  const { data: leave = [] } = useQuery({
    queryKey: ["attendance-weekly-leave", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, profile_id, type, status, start_date, end_date, profiles(first_name, last_name, staff_id)")
        .lte("start_date", to)
        .gte("end_date", from)
        .order("start_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  /** One row per staff member with a per-day cell keyed by date. */
  const staffRows = useMemo(() => {
    const map = new Map<
      string,
      {
        profileId: string;
        name: string;
        staffId: string;
        byDate: Record<string, { inAt: string | null; outAt: string | null; status: string | null; hours: number }>;
        leaveByDate: Record<string, string>;
        total: number;
        leaveDays: number;
      }

    >();

    for (const a of attendance) {
      const key = a.profile_id;
      if (!map.has(key)) {
        map.set(key, {
          profileId: key,
          name: nameOf(a.profiles) || "—",
          staffId: a.profiles?.staff_id ?? "—",
          byDate: {},
          leaveByDate: {},
          total: 0,
          leaveDays: 0,
        });
      }
      const row = map.get(key)!;
      const hours = hoursBetween(a.check_in, a.check_out);
      row.byDate[a.date] = { inAt: a.check_in, outAt: a.check_out, status: a.status, hours };
      row.total += hours;
    }

    // Count how many days of this week each staff member is on leave for.
    for (const l of leave) {
      if (!map.has(l.profile_id)) {
        map.set(l.profile_id, {
          profileId: l.profile_id,
          name: nameOf(l.profiles) || "—",
          staffId: l.profiles?.staff_id ?? "—",
          byDate: {},
          leaveByDate: {},
          total: 0,
          leaveDays: 0,
        });
      }
      const row = map.get(l.profile_id)!;
      if (l.status !== "approved") continue;
      for (const d of days) {
        const key = iso(d);
        if (key >= l.start_date && key <= l.end_date) {
          row.leaveDays += 1;
          row.leaveByDate[key] = l.type ?? "leave";
        }
      }
    }


    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [attendance, leave, days]);

  const totals = useMemo(() => {
    const perDay: Record<string, number> = {};
    let hours = 0;
    for (const r of staffRows) {
      hours += r.total;
      for (const [d, cell] of Object.entries(r.byDate)) {
        perDay[d] = (perDay[d] ?? 0) + cell.hours;
      }
    }
    return { hours, perDay, staff: staffRows.length };
  }, [staffRows]);

  const leaveCounts = useMemo(
    () => ({
      pending: leave.filter((l) => l.status === "pending").length,
      approved: leave.filter((l) => l.status === "approved").length,
      rejected: leave.filter((l) => l.status === "rejected").length,
    }),
    [leave]
  );

  const exportCsv = () => {
    const header = [
      "Staff",
      "Staff ID",
      ...days.flatMap((d) => {
        const lbl = format(d, "EEE dd/MM");
        return [`${lbl} in`, `${lbl} out`, `${lbl} hours`];
      }),
      "Total hours",
      "Leave days (approved)",
    ];
    const lines = [header.map(csvCellQuoted).join(",")];
    for (const r of staffRows) {
      const cells: string[] = [r.name, r.staffId];
      for (const d of days) {
        const cell = r.byDate[iso(d)];
        cells.push(clock(cell?.inAt ?? null), clock(cell?.outAt ?? null), (cell?.hours ?? 0).toFixed(2));
      }
      cells.push(r.total.toFixed(2), String(r.leaveDays));
      lines.push(cells.map(csvCellQuoted).join(","));
    }
    const footer: string[] = ["TOTAL", ""];
    for (const d of days) footer.push("", "", (totals.perDay[iso(d)] ?? 0).toFixed(2));
    footer.push(totals.hours.toFixed(2), "");
    lines.push(footer.map(csvCellQuoted).join(","));
    downloadCSVString(lines.join("\n"), `attendance-week-${from}.csv`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Weekly Attendance"
        subtitle={
          isAdminOrSupervisor
            ? "Clock-in and clock-out times, hours worked and leave for every staff member, week by week"
            : "Your clock-in and clock-out times, hours worked and leave, week by week"
        }
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={staffRows.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Week of {format(weekStart, "dd MMM yyyy")} – {format(addDays(weekStart, 6), "dd MMM yyyy")}
          </CardTitle>
          <CardDescription>
            Hours come from each recorded clock-in and clock-out pair (capped at {MAX_DAILY_HOURS} hours a day).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Previous week
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              Next week <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="week-pick">Jump to a date</Label>
            <Input
              id="week-pick"
              type="date"
              value={from}
              onChange={(e) => {
                if (!e.target.value) return;
                setWeekStart(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }));
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Total hours this week</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-secondary">{totals.hours.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Staff with records</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-secondary">{totals.staff}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Average hours per staff</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-secondary">
              {totals.staff ? (totals.hours / totals.staff).toFixed(2) : "0.00"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PlaneTakeoff className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Leave requests touching this week</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-secondary">{leave.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily clock-in / clock-out and hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Staff</TableHead>
                  <TableHead>Staff ID</TableHead>
                  {days.map((d) => (
                    <TableHead key={iso(d)} className="text-center">
                      {format(d, "EEE")}
                      <span className="block text-xs font-normal text-muted-foreground">{format(d, "dd/MM")}</span>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Leave days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={days.length + 4}>Loading…</TableCell>
                  </TableRow>
                ) : staffRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={days.length + 4}>No attendance recorded for this week.</TableCell>
                  </TableRow>
                ) : (
                  <>
                    {staffRows.map((r) => (
                      <TableRow key={r.profileId}>
                        <TableCell className="sticky left-0 bg-background font-medium">{r.name}</TableCell>
                        <TableCell>{r.staffId}</TableCell>
                        {days.map((d) => {
                          const cell = r.byDate[iso(d)];
                          return (
                            <TableCell key={iso(d)} className="text-center text-xs">
                              {cell ? (
                                <div className="space-y-0.5">
                                  <div>
                                    {clock(cell.inAt)} – {clock(cell.outAt)}
                                  </div>
                                  <div className="font-semibold text-secondary">{cell.hours.toFixed(2)}h</div>
                                  {cell.status && cell.status !== "present" && (
                                    <Badge variant="outline" className="text-[10px] capitalize">
                                      {cell.status}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-semibold">{r.total.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{r.leaveDays}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell className="sticky left-0 bg-muted/50">Total</TableCell>
                      <TableCell />
                      {days.map((d) => (
                        <TableCell key={iso(d)} className="text-center">
                          {(totals.perDay[iso(d)] ?? 0).toFixed(2)}h
                        </TableCell>
                      ))}
                      <TableCell className="text-right">{totals.hours.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Leave requests in this week
            <Badge variant="secondary">{leave.length}</Badge>
          </CardTitle>
          <CardDescription>
            Approvals are handled on the{" "}
            <Link className="underline" to="/leave">
              Leave / Pass Requests
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Pending: {leaveCounts.pending}</Badge>
            <Badge>Approved: {leaveCounts.approved}</Badge>
            <Badge variant="destructive">Rejected: {leaveCounts.rejected}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leave.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No leave requests overlap this week.</TableCell>
                  </TableRow>
                ) : (
                  leave.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{nameOf(l.profiles) || "—"}</TableCell>
                      <TableCell>{l.profiles?.staff_id ?? "—"}</TableCell>
                      <TableCell className="capitalize">{l.type}</TableCell>
                      <TableCell>{format(parseISO(l.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{format(parseISO(l.end_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="capitalize">{l.status}</TableCell>
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
