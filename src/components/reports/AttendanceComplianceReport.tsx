import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenu } from "@/components/ui/export-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarCheck, Users, AlertTriangle, Percent, FileWarning } from "lucide-react";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, format, isWeekend, isSameDay, parseISO,
} from "date-fns";

type Period = "weekly" | "monthly";
const ALL = "__all__";

function periodRange(period: Period, ref: Date) {
  if (period === "weekly") {
    return { from: startOfWeek(ref, { weekStartsOn: 1 }), to: endOfWeek(ref, { weekStartsOn: 1 }) };
  }
  return { from: startOfMonth(ref), to: endOfMonth(ref) };
}

export default function AttendanceComplianceReport() {
  const today = new Date();
  const [period, setPeriod] = useState<Period>("weekly");
  const [refDate, setRefDate] = useState(format(today, "yyyy-MM-dd"));
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [shiftGroup, setShiftGroup] = useState<string>(ALL);
  const [office, setOffice] = useState<string>(ALL);

  const { from, to } = useMemo(() => periodRange(period, parseISO(refDate)), [period, refDate]);
  const fromIso = format(from, "yyyy-MM-dd");
  const toIso = format(to, "yyyy-MM-dd");

  const { data: departments = [] } = useQuery({
    queryKey: ["acr-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["acr-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, department_id, shift_group, office, status, departments(name)")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  const officeOptions = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p: any) => { if (p.office) set.add(p.office); });
    return Array.from(set).sort();
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p: any) => {
      if (departmentId !== ALL && p.department_id !== departmentId) return false;
      if (shiftGroup !== ALL && p.shift_group !== shiftGroup) return false;
      if (office !== ALL && p.office !== office) return false;
      return true;
    });
  }, [profiles, departmentId, shiftGroup, office]);

  const profileIds = useMemo(() => filteredProfiles.map((p: any) => p.id), [filteredProfiles]);

  const { data: attendances = [] } = useQuery({
    queryKey: ["acr-attendances", fromIso, toIso, profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("profile_id, date, status, check_in")
        .gte("date", fromIso)
        .lte("date", toIso)
        .in("profile_id", profileIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["acr-leaves", fromIso, toIso, profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("profile_id, start_date, end_date, status")
        .eq("status", "approved")
        .lte("start_date", toIso)
        .gte("end_date", fromIso)
        .in("profile_id", profileIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["acr-holidays", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("date")
        .gte("date", fromIso)
        .lte("date", toIso);
      if (error) throw error;
      return (data ?? []).map((h: any) => h.date as string);
    },
  });

  const workingDays = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to });
    return days.filter((d) => {
      if (isWeekend(d)) return false;
      const iso = format(d, "yyyy-MM-dd");
      return !holidays.includes(iso);
    });
  }, [from, to, holidays]);

  const rows = useMemo(() => {
    return filteredProfiles.map((p: any) => {
      const attMap = new Map<string, any>();
      attendances.filter((a: any) => a.profile_id === p.id).forEach((a: any) => attMap.set(a.date, a));
      const leaveRanges = leaves.filter((l: any) => l.profile_id === p.id);

      let present = 0, absent = 0, late = 0, leave = 0, missing = 0;
      const missingDates: string[] = [];
      workingDays.forEach((d) => {
        const iso = format(d, "yyyy-MM-dd");
        const onLeave = leaveRanges.some((l: any) => iso >= l.start_date && iso <= l.end_date);
        if (onLeave) { leave++; return; }
        const att = attMap.get(iso);
        if (!att) {
          // No log at all for this working day → flag as missing/incomplete
          absent++;
          missing++;
          missingDates.push(iso);
          return;
        }
        if (att.status === "present") present++;
        else if (att.status === "late") { present++; late++; }
        else if (att.status === "absent") absent++;
        else if (att.status === "leave" || att.status === "on_leave") leave++;
        else absent++;
      });

      const expected = workingDays.length;
      const rate = expected > 0 ? (present / expected) * 100 : 0;
      const completeness = expected > 0 ? ((expected - missing) / expected) * 100 : 100;
      return {
        id: p.id,
        staff_id: p.staff_id,
        name: `${p.last_name}, ${p.first_name}`,
        department: p.departments?.name ?? "—",
        shift: p.shift_group ?? "—",
        office: p.office ?? "—",
        present, absent, late, leave, expected, rate,
        missing, completeness, missingDates,
      };
    }).sort((a, b) => a.rate - b.rate);
  }, [filteredProfiles, attendances, leaves, workingDays]);

  const totals = useMemo(() => {
    const expected = rows.reduce((s, r) => s + r.expected, 0);
    const present = rows.reduce((s, r) => s + r.present, 0);
    const absent = rows.reduce((s, r) => s + r.absent, 0);
    const late = rows.reduce((s, r) => s + r.late, 0);
    const missing = rows.reduce((s, r) => s + r.missing, 0);
    const incompleteStaff = rows.filter((r) => r.missing > 0).length;
    const overallRate = expected > 0 ? (present / expected) * 100 : 0;
    return { staff: rows.length, expected, present, absent, late, overallRate, missing, incompleteStaff };
  }, [rows]);

  const periodLabel = `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")}`;

  const buildExport = () => {
    if (rows.length === 0) return null;
    return {
      title: `Attendance Compliance — ${period === "weekly" ? "Weekly" : "Monthly"}`,
      filename: `attendance_compliance_${period}_${fromIso}_to_${toIso}`,
      headers: ["Staff ID", "Name", "Department", "Office", "Shift", "Working Days", "Present", "Absent", "Late", "Leave", "Missing Logs", "Compliance %", "Log Completeness %"],
      rows: rows.map((r) => [
        r.staff_id, r.name, r.department, r.office, r.shift,
        String(r.expected), String(r.present), String(r.absent),
        String(r.late), String(r.leave), String(r.missing),
        `${r.rate.toFixed(1)}%`, `${r.completeness.toFixed(1)}%`,
      ]),
      subtitle: `Period: ${periodLabel} | Staff: ${totals.staff} | Overall: ${totals.overallRate.toFixed(1)}% | Missing logs: ${totals.missing} across ${totals.incompleteStaff} staff`,
    };
  };

  const rateBadge = (rate: number) => {
    if (rate >= 90) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (rate >= 75) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Attendance Compliance Report
          </CardTitle>
          <p className="text-xs text-muted-foreground">{periodLabel} · {workingDays.length} working day(s)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference date</Label>
              <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Shift</Label>
              <Select value={shiftGroup} onValueChange={setShiftGroup}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All shifts</SelectItem>
                  <SelectItem value="A">Shift A</SelectItem>
                  <SelectItem value="B">Shift B</SelectItem>
                  <SelectItem value="C">Shift C</SelectItem>
                  <SelectItem value="D">Shift D</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Office</Label>
              <Select value={office} onValueChange={setOffice}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All offices</SelectItem>
                  {officeOptions.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Percent className="h-3.5 w-3.5" /> Overall compliance</div>
          <div className="text-2xl font-bold mt-1">{totals.overallRate.toFixed(1)}%</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Staff</div>
          <div className="text-2xl font-bold mt-1">{totals.staff}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Absences</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{totals.absent}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Late</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{totals.late}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileWarning className="h-3.5 w-3.5" /> Missing logs</div>
          <div className="text-2xl font-bold mt-1 text-amber-700">{totals.missing}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{totals.incompleteStaff} staff incomplete</div>
        </CardContent></Card>
      </div>

      {totals.missing > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>Incomplete attendance logs detected</AlertTitle>
          <AlertDescription className="text-amber-800">
            {totals.missing} working day{totals.missing === 1 ? "" : "s"} have no recorded check-in for {totals.incompleteStaff} staff member{totals.incompleteStaff === 1 ? "" : "s"} in this period.
            Compliance metrics treat these as absences — review the highlighted rows below before circulating this report.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Per-staff breakdown</CardTitle>
          <ExportMenu label="Export" size="sm" variant="outline" getData={buildExport} />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No staff match the selected filters.</div>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Office</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Leave</TableHead>
                    <TableHead className="text-right">Missing</TableHead>
                    <TableHead className="text-right">Compliance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={r.missing > 0 ? "bg-amber-50/60" : ""}>
                      <TableCell>
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          {r.name}
                          {r.missing > 0 && (
                            <FileWarning
                              className="h-3.5 w-3.5 text-amber-600"
                              aria-label={`${r.missing} missing attendance log${r.missing === 1 ? "" : "s"}`}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.staff_id}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.department}</TableCell>
                      <TableCell className="text-xs">{r.office}</TableCell>
                      <TableCell className="text-xs">{r.shift}</TableCell>
                      <TableCell className="text-right text-xs">{r.present}/{r.expected}</TableCell>
                      <TableCell className="text-right text-xs text-red-600">{r.absent}</TableCell>
                      <TableCell className="text-right text-xs text-amber-600">{r.late}</TableCell>
                      <TableCell className="text-right text-xs">{r.leave}</TableCell>
                      <TableCell className="text-right text-xs">
                        {r.missing > 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-800 border-amber-200"
                            title={`Missing dates: ${r.missingDates.slice(0, 5).join(", ")}${r.missingDates.length > 5 ? "…" : ""}`}
                          >
                            {r.missing}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={rateBadge(r.rate)}>{r.rate.toFixed(1)}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
