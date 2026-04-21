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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { logAdminAudit } from "@/lib/admin-audit";
import { downloadAttendanceComplianceTemplate } from "@/lib/attendance-compliance-template";
import { AttendanceComplianceImportDialog } from "@/components/reports/AttendanceComplianceImportDialog";
import { AttendanceComplianceExportDialog, AttendanceComplianceExportButton } from "@/components/reports/AttendanceComplianceExportDialog";
import { exportReport, type ExportFormat } from "@/lib/export-utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, Users, AlertTriangle, Percent, FileWarning, CheckCircle2, XCircle, Clock, Plane, PartyPopper, CalendarOff, FileDown, Upload } from "lucide-react";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, format, isWeekend, parseISO,
} from "date-fns";

type DayKind = "present" | "late" | "absent" | "leave" | "missing" | "holiday" | "weekend";
interface DayDetail {
  date: string;
  kind: DayKind;
  note?: string;
}

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
  const { role } = useAuthContext();
  const queryClient = useQueryClient();
  const canImport = role === "admin" || role === "oic" || role === "2ic" || role === "staff_officer";
  const [period, setPeriod] = useState<Period>("weekly");
  const [refDate, setRefDate] = useState(format(today, "yyyy-MM-dd"));
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [shiftGroup, setShiftGroup] = useState<string>(ALL);
  const [office, setOffice] = useState<string>(ALL);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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

  const allPeriodDays = useMemo(() => eachDayOfInterval({ start: from, end: to }), [from, to]);

  const rows = useMemo(() => {
    return filteredProfiles.map((p: any) => {
      const attMap = new Map<string, any>();
      attendances.filter((a: any) => a.profile_id === p.id).forEach((a: any) => attMap.set(a.date, a));
      const leaveRanges = leaves.filter((l: any) => l.profile_id === p.id);

      let present = 0, absent = 0, late = 0, leave = 0, missing = 0;
      const missingDates: string[] = [];
      const dayDetails: DayDetail[] = [];

      allPeriodDays.forEach((d) => {
        const iso = format(d, "yyyy-MM-dd");
        const isHoliday = holidays.includes(iso);
        const onLeave = leaveRanges.some((l: any) => iso >= l.start_date && iso <= l.end_date);
        const att = attMap.get(iso);

        // Categorise the day for the modal regardless of whether it counts towards compliance
        if (isWeekend(d)) {
          dayDetails.push({ date: iso, kind: "weekend" });
          return;
        }
        if (isHoliday) {
          dayDetails.push({ date: iso, kind: "holiday" });
          return;
        }
        if (onLeave) {
          leave++;
          dayDetails.push({ date: iso, kind: "leave", note: "Approved leave" });
          return;
        }
        if (!att) {
          absent++;
          missing++;
          missingDates.push(iso);
          dayDetails.push({ date: iso, kind: "missing", note: "Expected working day — no log" });
          return;
        }
        if (att.status === "present") {
          present++;
          dayDetails.push({ date: iso, kind: "present" });
        } else if (att.status === "late") {
          present++; late++;
          dayDetails.push({ date: iso, kind: "late" });
        } else if (att.status === "absent") {
          absent++;
          dayDetails.push({ date: iso, kind: "absent" });
        } else if (att.status === "leave" || att.status === "on_leave") {
          leave++;
          dayDetails.push({ date: iso, kind: "leave", note: att.notes ?? "Leave" });
        } else {
          absent++;
          dayDetails.push({ date: iso, kind: "absent", note: att.status });
        }
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
        missing, completeness, missingDates, dayDetails,
      };
    }).sort((a, b) => a.rate - b.rate);
  }, [filteredProfiles, attendances, leaves, workingDays, allPeriodDays, holidays]);

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

  const [detailStaff, setDetailStaff] = useState<typeof rows[number] | null>(null);


  const periodLabel = `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")}`;

  const buildExport = () => {
    if (rows.length === 0) return null;
    const departmentName = departmentId === ALL
      ? "All departments"
      : (departments as any[]).find((d) => d.id === departmentId)?.name ?? "—";
    const shiftName = shiftGroup === ALL ? "All shifts" : `Shift ${shiftGroup}`;
    const officeName = office === ALL ? "All offices" : office;
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
      meta: [
        { label: "Report period", value: `${period === "weekly" ? "Weekly" : "Monthly"} — ${periodLabel}` },
        { label: "Working days", value: `${workingDays.length}` },
        { label: "Department filter", value: departmentName },
        { label: "Shift filter", value: shiftName },
        { label: "Office filter", value: officeName },
        { label: "Generated at", value: format(new Date(), "dd MMM yyyy, HH:mm") },
      ],
    };
  };

  /**
   * Build an export payload for an arbitrary date range + dept/office subset by
   * re-querying the database. Used by the scoped export dialog so the user can
   * pick a custom range/scope without changing the on-screen view.
   */
  const buildScopedExport = async (opts: {
    fromIso: string;
    toIso: string;
    departmentIds: string[];
    offices: string[];
  }) => {
    const fromD = parseISO(opts.fromIso);
    const toD = parseISO(opts.toIso);

    // Profiles in scope
    let profileQuery = supabase
      .from("profiles")
      .select("id, staff_id, first_name, last_name, department_id, shift_group, office, status, departments(name)")
      .eq("status", "active");
    if (opts.departmentIds.length > 0) profileQuery = profileQuery.in("department_id", opts.departmentIds);
    if (opts.offices.length > 0) profileQuery = profileQuery.in("office", opts.offices);
    const { data: scopedProfiles, error: pErr } = await profileQuery;
    if (pErr) throw pErr;
    const ids = (scopedProfiles ?? []).map((p: any) => p.id);
    if (ids.length === 0) {
      return { rows: [], payload: null };
    }

    const [{ data: att, error: aErr }, { data: lv, error: lErr }, { data: hol, error: hErr }] = await Promise.all([
      supabase.from("attendances").select("profile_id, date, status, check_in, notes")
        .gte("date", opts.fromIso).lte("date", opts.toIso).in("profile_id", ids),
      supabase.from("leave_requests").select("profile_id, start_date, end_date, status")
        .eq("status", "approved").lte("start_date", opts.toIso).gte("end_date", opts.fromIso).in("profile_id", ids),
      supabase.from("holidays").select("date").gte("date", opts.fromIso).lte("date", opts.toIso),
    ]);
    if (aErr) throw aErr;
    if (lErr) throw lErr;
    if (hErr) throw hErr;
    const holidaysList = (hol ?? []).map((h: any) => h.date as string);
    const allDays = eachDayOfInterval({ start: fromD, end: toD });
    const workDays = allDays.filter((d) => !isWeekend(d) && !holidaysList.includes(format(d, "yyyy-MM-dd")));

    const scopedRows = (scopedProfiles ?? []).map((p: any) => {
      const attMap = new Map<string, any>();
      (att ?? []).filter((a: any) => a.profile_id === p.id).forEach((a: any) => attMap.set(a.date, a));
      const leaveRanges = (lv ?? []).filter((l: any) => l.profile_id === p.id);
      let present = 0, absent = 0, late = 0, leave = 0, missing = 0;
      allDays.forEach((d) => {
        if (isWeekend(d)) return;
        const iso = format(d, "yyyy-MM-dd");
        if (holidaysList.includes(iso)) return;
        const onLeave = leaveRanges.some((l: any) => iso >= l.start_date && iso <= l.end_date);
        const a = attMap.get(iso);
        if (onLeave) { leave++; return; }
        if (!a) { absent++; missing++; return; }
        if (a.status === "present") present++;
        else if (a.status === "late") { present++; late++; }
        else if (a.status === "absent") absent++;
        else if (a.status === "leave" || a.status === "on_leave") leave++;
        else absent++;
      });
      const expected = workDays.length;
      const rate = expected > 0 ? (present / expected) * 100 : 0;
      const completeness = expected > 0 ? ((expected - missing) / expected) * 100 : 100;
      return {
        staff_id: p.staff_id,
        name: `${p.last_name}, ${p.first_name}`,
        department: p.departments?.name ?? "—",
        office: p.office ?? "—",
        shift: p.shift_group ?? "—",
        present, absent, late, leave, expected, missing, rate, completeness,
      };
    }).sort((a, b) => a.rate - b.rate);

    const deptNames = opts.departmentIds.length === 0
      ? "All departments"
      : (departments as any[]).filter((d) => opts.departmentIds.includes(d.id)).map((d) => d.name).join(", ");
    const officeNames = opts.offices.length === 0 ? "All offices" : opts.offices.join(", ");
    const periodLbl = `${format(fromD, "dd MMM yyyy")} – ${format(toD, "dd MMM yyyy")}`;
    const totalsExpected = scopedRows.reduce((s, r) => s + r.expected, 0);
    const totalsPresent = scopedRows.reduce((s, r) => s + r.present, 0);
    const totalsMissing = scopedRows.reduce((s, r) => s + r.missing, 0);
    const incomplete = scopedRows.filter((r) => r.missing > 0).length;
    const overall = totalsExpected > 0 ? (totalsPresent / totalsExpected) * 100 : 0;

    const payload = {
      title: "Attendance Compliance — Custom range",
      filename: `attendance_compliance_${opts.fromIso}_to_${opts.toIso}`,
      headers: ["Staff ID", "Name", "Department", "Office", "Shift", "Working Days", "Present", "Absent", "Late", "Leave", "Missing Logs", "Compliance %", "Log Completeness %"],
      rows: scopedRows.map((r) => [
        r.staff_id, r.name, r.department, r.office, r.shift,
        String(r.expected), String(r.present), String(r.absent),
        String(r.late), String(r.leave), String(r.missing),
        `${r.rate.toFixed(1)}%`, `${r.completeness.toFixed(1)}%`,
      ]),
      subtitle: `Period: ${periodLbl} | Staff: ${scopedRows.length} | Overall: ${overall.toFixed(1)}% | Missing logs: ${totalsMissing} across ${incomplete} staff`,
      meta: [
        { label: "Report period", value: `Custom — ${periodLbl}` },
        { label: "Working days", value: `${workDays.length}` },
        { label: "Department filter", value: deptNames },
        { label: "Office filter", value: officeNames },
        { label: "Generated at", value: format(new Date(), "dd MMM yyyy, HH:mm") },
      ],
    };

    return { rows: scopedRows, payload };
  };

  const handleScopedExport = async (
    opts: { fromIso: string; toIso: string; departmentIds: string[]; offices: string[] },
    fmt: ExportFormat,
  ): Promise<number> => {
    const { rows: r, payload } = await buildScopedExport(opts);
    if (!payload || r.length === 0) return 0;
    exportReport(fmt, payload);
    logAdminAudit("attendance_compliance_report", "exported", {
      format: fmt,
      from: opts.fromIso, to: opts.toIso,
      filters: { departmentIds: opts.departmentIds, offices: opts.offices },
      row_count: r.length,
      location: "scoped_dialog",
    });
    return r.length;
  };

  const rateBadge = (rate: number) => {
    if (rate >= 90) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (rate >= 75) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Attendance Compliance Report
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel} · {workingDays.length} working day(s)</p>
          </div>
          <div className="flex items-center gap-2">
            {canImport && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setImportOpen(true)}
                title="Import monthly figures — re-importing the same month updates existing rows"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                try {
                  const filename = downloadAttendanceComplianceTemplate({
                    departments: (departments as any[]).map((d) => d.name),
                    offices: officeOptions,
                  });
                  toast.success("Template downloaded");
                  logAdminAudit("attendance_compliance_template", "downloaded", {
                    filename,
                    departments_count: (departments as any[]).length,
                    offices_count: officeOptions.length,
                  });
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not generate template");
                }
              }}
            >
              <FileDown className="h-4 w-4" />
              Template
            </Button>
            <AttendanceComplianceExportButton onClick={() => setExportOpen(true)} />
            <ExportMenu
              label="Quick"
              size="sm"
              variant="outline"
              getData={buildExport}
              onExported={(fmt) => logAdminAudit("attendance_compliance_report", "exported", {
                format: fmt, period, from: fromIso, to: toIso,
                filters: { departmentId, shiftGroup, office },
                row_count: rows.length,
                location: "header_quick",
              })}
            />
          </div>
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
          <ExportMenu
            label="Export"
            size="sm"
            variant="outline"
            getData={buildExport}
            onExported={(fmt) => logAdminAudit("attendance_compliance_report", "exported", {
              format: fmt, period, from: fromIso, to: toIso,
              filters: { departmentId, shiftGroup, office },
              row_count: rows.length,
              location: "table",
            })}
          />
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
                    <TableRow
                      key={r.id}
                      className={`cursor-pointer hover:bg-muted/40 ${r.missing > 0 ? "bg-amber-50/60" : ""}`}
                      onClick={() => {
                        setDetailStaff(r);
                        logAdminAudit(
                          "attendance_compliance_staff_detail",
                          "opened",
                          {
                            staff_id: r.staff_id, name: r.name,
                            department: r.department, office: r.office, shift: r.shift,
                            period, from: fromIso, to: toIso,
                            missing: r.missing, compliance_pct: Number(r.rate.toFixed(1)),
                          },
                          r.id,
                        );
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailStaff(r);
                          logAdminAudit(
                            "attendance_compliance_staff_detail",
                            "opened",
                            {
                              staff_id: r.staff_id, name: r.name,
                              department: r.department, office: r.office, shift: r.shift,
                              period, from: fromIso, to: toIso,
                              missing: r.missing, compliance_pct: Number(r.rate.toFixed(1)),
                              via: "keyboard",
                            },
                            r.id,
                          );
                        }
                      }}
                      aria-label={`View attendance breakdown for ${r.name}`}
                    >
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

      <StaffDetailDialog
        staff={detailStaff}
        periodLabel={periodLabel}
        onClose={() => setDetailStaff(null)}
      />

      <AttendanceComplianceImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initialReferenceDate={refDate}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ["acr-attendances"] });
          queryClient.invalidateQueries({ queryKey: ["attendance_compliance_snapshots"] });
        }}
      />

      <AttendanceComplianceExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        initial={{ fromIso, toIso, departmentId, office }}
        onExport={handleScopedExport}
      />
    </div>
  );
}

const KIND_META: Record<DayKind, { label: string; icon: any; className: string }> = {
  present:  { label: "Present",          icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  late:     { label: "Late",             icon: Clock,        className: "bg-amber-100 text-amber-800 border-amber-200" },
  absent:   { label: "Absent",           icon: XCircle,      className: "bg-red-100 text-red-800 border-red-200" },
  leave:    { label: "Approved leave",   icon: Plane,        className: "bg-blue-100 text-blue-800 border-blue-200" },
  missing:  { label: "Missing log",      icon: FileWarning,  className: "bg-amber-100 text-amber-900 border-amber-300" },
  holiday:  { label: "Public holiday",   icon: PartyPopper,  className: "bg-purple-100 text-purple-800 border-purple-200" },
  weekend:  { label: "Weekend / off",    icon: CalendarOff,  className: "bg-muted text-muted-foreground border-border" },
};

function StaffDetailDialog({
  staff,
  periodLabel,
  onClose,
}: {
  staff: any | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const open = !!staff;
  const counts = staff ? staff.dayDetails.reduce((acc: Record<DayKind, number>, d: DayDetail) => {
    acc[d.kind] = (acc[d.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<DayKind, number>) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {staff && (
          <>
            <DialogHeader>
              <DialogTitle>{staff.name}</DialogTitle>
              <DialogDescription>
                {staff.staff_id} · {staff.department} · {staff.office} · Shift {staff.shift}
                <br />
                <span className="text-xs">{periodLabel}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 my-3">
              {(["present", "late", "absent", "leave", "missing", "holiday", "weekend"] as DayKind[]).map((k) => {
                const Icon = KIND_META[k].icon;
                const n = counts?.[k] ?? 0;
                if (n === 0) return null;
                return (
                  <div key={k} className={`rounded-md border p-2 text-xs ${KIND_META[k].className}`}>
                    <div className="flex items-center gap-1.5 font-medium"><Icon className="h-3.5 w-3.5" />{KIND_META[k].label}</div>
                    <div className="text-lg font-bold mt-0.5">{n}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.dayDetails.map((d: DayDetail) => {
                    const meta = KIND_META[d.kind];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={d.date}>
                        <TableCell className="text-xs font-mono">{format(parseISO(d.date), "EEE, dd MMM")}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(d.date), "EEEE")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 ${meta.className}`}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.note ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-2">
              Compliance counts only working days (excluding weekends &amp; public holidays). Missing logs are working days with no recorded check-in and are treated as absences.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
