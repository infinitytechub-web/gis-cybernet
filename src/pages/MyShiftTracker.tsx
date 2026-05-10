import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  getISOWeek,
  differenceInMinutes,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  CheckCircle2,
  Timer,
  CalendarDays,
  Activity,
  LogIn,
  LogOut,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExportMenu } from "@/components/ui/export-menu";
import { ShiftChangeRequestPanel } from "@/components/shifts/ShiftChangeRequestPanel";
import { AttendanceEditRequestPanel } from "@/components/shifts/AttendanceEditRequestPanel";
import { MyShiftRotationCalendar } from "@/components/shifts/MyShiftRotationCalendar";
import { RotationChangeProposalPanel } from "@/components/shifts/RotationChangeProposalPanel";
import { cn } from "@/lib/utils";

type WindowSettings = {
  grace_minutes: number;
  early_checkin_minutes: number;
  late_checkout_minutes: number;
  enforce_window: boolean;
};
const DEFAULT_WINDOW: WindowSettings = {
  grace_minutes: 15,
  early_checkin_minutes: 30,
  late_checkout_minutes: 60,
  enforce_window: true,
};

type Profile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  shift_group: string | null;
};

type Shift = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type Assignment = {
  id: string;
  shift_id: string;
  start_date: string;
  end_date: string | null;
  shifts: Shift | null;
};

type Attendance = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
};

const SHIFT_GROUP_TONE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  C: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  D: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function fmtMinutes(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

const GRACE_MIN = 5; // tolerance window in minutes either side of scheduled start
type Punctuality = {
  kind: "early" | "ontime" | "late" | "outside";
  diffMin: number;
  label: string;
};
function computePunctuality(checkInIso: string, dateKey: string, shift: { start_time: string | null; end_time: string | null } | undefined | null): Punctuality | null {
  if (!shift?.start_time || !shift?.end_time) return null;
  const start = new Date(`${dateKey}T${shift.start_time}`);
  // If end < start, shift crosses midnight
  let end = new Date(`${dateKey}T${shift.end_time}`);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const checkIn = new Date(checkInIso);
  const diffMs = checkIn.getTime() - start.getTime();
  const diffMin = Math.round(diffMs / 60000);
  // Outside window entirely (more than 4h before shift start, or after shift end)
  if (diffMin < -240 || checkIn > end) {
    return { kind: "outside", diffMin, label: `Outside shift window (${fmtMinutes(Math.abs(diffMin))} ${diffMin < 0 ? "before start" : "after end"})` };
  }
  if (diffMin < -GRACE_MIN) {
    return { kind: "early", diffMin, label: `Early by ${fmtMinutes(Math.abs(diffMin))}` };
  }
  if (diffMin > GRACE_MIN) {
    return { kind: "late", diffMin, label: `Late by ${fmtMinutes(diffMin)}` };
  }
  return { kind: "ontime", diffMin, label: "On time" };
}

export default function MyShiftTracker() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow(1000);
  const [cursor, setCursor] = useState<Date>(() => new Date());

  // Profile
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["my-shift-tracker", "profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, staff_id, shift_group, department_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  // Shift assignments overlapping the visible month
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["my-shift-tracker", "assignments", profile?.id, format(monthStart, "yyyy-MM")],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, shift_id, start_date, end_date, shifts(id, name, start_time, end_time)")
        .eq("profile_id", profile!.id)
        .lte("start_date", format(monthEnd, "yyyy-MM-dd"))
        .or(`end_date.is.null,end_date.gte.${format(monthStart, "yyyy-MM-dd")}`);
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  // Attendance for current month
  const { data: attendances = [], isLoading: loadingAttendance } = useQuery({
    queryKey: ["my-shift-tracker", "attendance", profile?.id, format(monthStart, "yyyy-MM")],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("id, date, check_in, check_out, status")
        .eq("profile_id", profile!.id)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });

  // Realtime: attendance + shift_assignments for this profile
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`my-shift-tracker-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendances", filter: `profile_id=eq.${profile.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "attendance"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_assignments", filter: `profile_id=eq.${profile.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "assignments"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  // Map date -> assignment(s) and attendance + punctuality alert
  const dateMap = useMemo(() => {
    const m = new Map<string, { assignments: Assignment[]; attendance?: Attendance; punctuality?: Punctuality | null }>();
    days.forEach((d) => {
      const key = format(d, "yyyy-MM-dd");
      const dayAssign = assignments.filter((a) => {
        const s = a.start_date;
        const e = a.end_date ?? "9999-12-31";
        return key >= s && key <= e;
      });
      const att = attendances.find((x) => x.date === key);
      const shift = dayAssign[0]?.shifts ?? null;
      const punctuality = att?.check_in ? computePunctuality(att.check_in, key, shift) : null;
      m.set(key, { assignments: dayAssign, attendance: att, punctuality });
    });
    return m;
  }, [days, assignments, attendances]);

  // Summary metrics for current month
  const metrics = useMemo(() => {
    const monthDays = days.filter((d) => isSameMonth(d, cursor));
    let scheduled = 0;
    let worked = 0;
    let totalMinutes = 0;
    let weekMinutes = 0;
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    monthDays.forEach((d) => {
      const key = format(d, "yyyy-MM-dd");
      const entry = dateMap.get(key);
      if (entry?.assignments.length) scheduled += 1;
      const att = entry?.attendance;
      if (att?.check_in) worked += 1;
      if (att?.check_in && att?.check_out) {
        const mins = Math.max(0, differenceInMinutes(parseISO(att.check_out), parseISO(att.check_in)));
        totalMinutes += mins;
        if (d >= weekStart && d <= weekEnd) weekMinutes += mins;
      }
    });

    // Add live minutes for an open check-in today
    const todayKey = format(now, "yyyy-MM-dd");
    const today = dateMap.get(todayKey);
    let liveMinutes = 0;
    if (today?.attendance?.check_in && !today.attendance.check_out) {
      liveMinutes = Math.max(0, differenceInMinutes(now, parseISO(today.attendance.check_in)));
    }

    return {
      scheduled,
      worked,
      totalMinutes: totalMinutes + liveMinutes,
      weekMinutes: weekMinutes + liveMinutes,
      liveMinutes,
      currentWeek: getISOWeek(now),
      monthName: format(cursor, "MMMM yyyy"),
    };
  }, [days, dateMap, cursor, now]);

  const todayEntry = dateMap.get(format(now, "yyyy-MM-dd"));
  const todayShift = todayEntry?.assignments[0]?.shifts;
  const todayAtt = todayEntry?.attendance;
  const todayPunctuality = todayEntry?.punctuality ?? null;

  // List of all shifts for the change/override request form
  const { data: allShifts = [] } = useQuery({
    queryKey: ["my-shift-tracker", "all-shifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, name, start_time, end_time")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; start_time: string | null; end_time: string | null }[];
    },
  });

  // Attendance window settings (admin-configurable, global)
  const { data: windowSettings } = useQuery({
    queryKey: ["attendance-window-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_window_settings")
        .select("grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULT_WINDOW) as WindowSettings;
    },
  });
  const globalWin = windowSettings ?? DEFAULT_WINDOW;

  // Per-shift overrides (admin-configurable per shift type and optional date range)
  const todayShiftId = todayEntry?.assignments[0]?.shift_id ?? null;
  const todayDateKey = format(now, "yyyy-MM-dd");
  const { data: shiftOverride } = useQuery({
    queryKey: ["attendance-window-override", todayShiftId, todayDateKey],
    enabled: !!todayShiftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_attendance_window_overrides")
        .select("grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window, effective_from, effective_to")
        .eq("shift_id", todayShiftId!)
        .or(`effective_from.is.null,effective_from.lte.${todayDateKey}`)
        .or(`effective_to.is.null,effective_to.gte.${todayDateKey}`)
        .order("effective_from", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Partial<WindowSettings> | null;
    },
  });

  // Effective window for today: per-shift override merged onto global
  const win: WindowSettings & { source: "override" | "global" } = useMemo(() => ({
    grace_minutes: shiftOverride?.grace_minutes ?? globalWin.grace_minutes,
    early_checkin_minutes: shiftOverride?.early_checkin_minutes ?? globalWin.early_checkin_minutes,
    late_checkout_minutes: shiftOverride?.late_checkout_minutes ?? globalWin.late_checkout_minutes,
    enforce_window: shiftOverride?.enforce_window ?? globalWin.enforce_window,
    source: shiftOverride ? "override" : "global",
  }), [shiftOverride, globalWin]);

  const loading = loadingProfile || loadingAssignments || loadingAttendance;

  // ============ Check-in / Check-out mutations ============
  const todayKey = format(now, "yyyy-MM-dd");

  // Compute today's allowed window from assigned shift + settings
  const todayWindow = useMemo(() => {
    if (!todayShift?.start_time || !todayShift?.end_time) return null;
    const start = new Date(`${todayKey}T${todayShift.start_time}`);
    let end = new Date(`${todayKey}T${todayShift.end_time}`);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const earliestIn = new Date(start.getTime() - win.early_checkin_minutes * 60000);
    const latestIn = new Date(start.getTime() + (win.grace_minutes + 240) * 60000); // allow late check-in up to 4h after start
    const latestOut = new Date(end.getTime() + win.late_checkout_minutes * 60000);
    return { start, end, earliestIn, latestIn, latestOut };
  }, [todayShift?.start_time, todayShift?.end_time, todayKey, win.early_checkin_minutes, win.grace_minutes, win.late_checkout_minutes]);

  function validateCheckIn(at: Date): string | null {
    if (!win.enforce_window) return null;
    if (!todayShift) return "No shift is assigned for today. Please request an override.";
    if (!todayWindow) return null;
    if (at < todayWindow.earliestIn) {
      return `Too early. Check-in opens at ${format(todayWindow.earliestIn, "HH:mm")} (${win.early_checkin_minutes} min before shift start).`;
    }
    if (at > todayWindow.latestIn) {
      return `Outside check-in window. Submit a shift change/override request instead.`;
    }
    return null;
  }

  function validateCheckOut(at: Date): string | null {
    if (!win.enforce_window) return null;
    if (!todayWindow) return null;
    if (at > todayWindow.latestOut) {
      return `Too late to check out. The window closed at ${format(todayWindow.latestOut, "HH:mm")}. Submit a time-edit request.`;
    }
    return null;
  }

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Profile not loaded");
      const at = new Date();
      const err = validateCheckIn(at);
      if (err) throw new Error(err);
      const ts = at.toISOString();
      const { error } = await supabase.from("attendances").insert({
        profile_id: profile.id,
        date: todayKey,
        check_in: ts,
        status: "present",
      });
      if (error) throw error;
      return ts;
    },
    onSuccess: () => {
      toast.success("Checked in");
      queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "attendance"] });
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Check-in failed"),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!todayAtt?.id) throw new Error("No active check-in");
      const at = new Date();
      const err = validateCheckOut(at);
      if (err) throw new Error(err);
      const ts = at.toISOString();
      const { error } = await supabase
        .from("attendances")
        .update({ check_out: ts })
        .eq("id", todayAtt.id);
      if (error) throw error;
      return ts;
    },
    onSuccess: () => {
      toast.success("Checked out");
      queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "attendance"] });
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Check-out failed"),
  });

  // ============ Export filter state ============
  const [exportScope, setExportScope] = useState<"all" | "scheduled" | "worked" | "missed">("all");
  const [exportStatus, setExportStatus] = useState<"any" | "present" | "late" | "absent" | "excused">("any");

  const exportRows = useMemo(() => {
    const monthDays = days.filter((d) => isSameMonth(d, cursor));
    return monthDays
      .map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const entry = dateMap.get(key);
        const assignName = entry?.assignments[0]?.shifts?.name ?? "";
        const att = entry?.attendance;
        const hasShift = !!entry?.assignments.length;
        const hasIn = !!att?.check_in;
        const completed = !!att?.check_in && !!att?.check_out;
        const minutes =
          completed
            ? Math.max(0, differenceInMinutes(parseISO(att!.check_out!), parseISO(att!.check_in!)))
            : 0;
        return {
          d,
          key,
          weekday: format(d, "EEE"),
          week: getISOWeek(d),
          assignName,
          hasShift,
          hasIn,
          completed,
          checkIn: att?.check_in ? format(parseISO(att.check_in), "HH:mm:ss") : "",
          checkOut: att?.check_out ? format(parseISO(att.check_out), "HH:mm:ss") : "",
          status: att?.status ?? "",
          minutes,
        };
      })
      .filter((r) => {
        if (exportScope === "scheduled" && !r.hasShift) return false;
        if (exportScope === "worked" && !r.hasIn) return false;
        if (exportScope === "missed" && !(r.hasShift && !r.hasIn)) return false;
        if (exportStatus !== "any" && r.status !== exportStatus) return false;
        return true;
      });
  }, [days, dateMap, cursor, exportScope, exportStatus]);

  const buildExportPayload = () => {
    const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Staff";
    const subtitle = [
      `Staff: ${fullName}${profile?.staff_id ? ` (${profile.staff_id})` : ""}`,
      `Shift Group: ${profile?.shift_group ?? "—"}`,
      `Period: ${format(monthStart, "dd MMM yyyy")} – ${format(monthEnd, "dd MMM yyyy")}`,
      `Scope: ${exportScope}`,
      `Status: ${exportStatus}`,
      `Totals: ${metrics.scheduled} scheduled · ${metrics.worked} worked · ${fmtMinutes(metrics.totalMinutes)}`,
    ].join(" · ");
    return {
      title: `My Shift & Attendance — ${metrics.monthName}`,
      filename: `my-shift-${format(cursor, "yyyy-MM")}`,
      subtitle,
      headers: ["Date", "Day", "Wk", "Assigned shift", "Check-in", "Check-out", "Status", "Hours"],
      rows: exportRows.map((r) => [
        r.key,
        r.weekday,
        `W${r.week}`,
        r.assignName || "—",
        r.checkIn || "—",
        r.checkOut || "—",
        r.status || "—",
        r.minutes > 0 ? fmtMinutes(r.minutes) : "—",
      ]),
    };
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            My Shift Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time view of your shift days, weeks, hours and dates within the month.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border bg-card px-3 py-2 text-right shadow-sm">
            <div className="text-xs text-muted-foreground">Current time</div>
            <div className="font-mono text-lg font-semibold tabular-nums">{format(now, "HH:mm:ss")}</div>
            <div className="text-xs text-muted-foreground">{format(now, "EEE, dd MMM yyyy")}</div>
          </div>
          {profile?.shift_group && (
            <Badge
              variant="outline"
              className={cn("text-sm px-3 py-1.5 border", SHIFT_GROUP_TONE[profile.shift_group] ?? "")}
            >
              Group {profile.shift_group}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile
          icon={CalendarDays}
          label="Scheduled this month"
          value={`${metrics.scheduled} ${metrics.scheduled === 1 ? "day" : "days"}`}
          tone="text-indigo-600 dark:text-indigo-400"
        />
        <SummaryTile
          icon={CheckCircle2}
          label="Days worked"
          value={`${metrics.worked} / ${metrics.scheduled || "—"}`}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryTile
          icon={Timer}
          label={`Hours this week (W${metrics.currentWeek})`}
          value={fmtMinutes(metrics.weekMinutes)}
          tone="text-cyan-600 dark:text-cyan-400"
        />
        <SummaryTile
          icon={Clock}
          label="Hours this month"
          value={fmtMinutes(metrics.totalMinutes)}
          tone="text-amber-600 dark:text-amber-400"
          live={metrics.liveMinutes > 0}
        />
      </div>

      {/* Today snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {now.getHours() >= 18 || now.getHours() < 6 ? (
              <Moon className="h-4 w-4 text-indigo-500" />
            ) : (
              <Sun className="h-4 w-4 text-amber-500" />
            )}
            Today — {format(now, "EEEE, dd MMM")}
          </CardTitle>
          <CardDescription>Live snapshot of your assignment and check-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <InfoRow
              label="Assigned shift"
              value={todayShift?.name ?? "No assignment"}
              hint={
                todayShift?.start_time && todayShift?.end_time
                  ? `${todayShift.start_time.slice(0, 5)} – ${todayShift.end_time.slice(0, 5)}`
                  : undefined
              }
            />
            <InfoRow
              label="Check-in"
              value={todayAtt?.check_in ? format(parseISO(todayAtt.check_in), "HH:mm:ss") : "—"}
              hint={todayAtt?.status ? `Status: ${todayAtt.status}` : undefined}
            />
            <InfoRow
              label={todayAtt?.check_out ? "Check-out" : "Time on duty"}
              value={
                todayAtt?.check_out
                  ? format(parseISO(todayAtt.check_out), "HH:mm:ss")
                  : todayAtt?.check_in
                    ? fmtMinutes(metrics.liveMinutes)
                    : "—"
              }
              hint={todayAtt?.check_in && !todayAtt?.check_out ? "Live · still on duty" : undefined}
              live={!!todayAtt?.check_in && !todayAtt?.check_out}
            />
          </div>

          {/* Quick check-in / check-out */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!todayAtt?.check_in ? (
              <Button
                onClick={() => checkInMutation.mutate()}
                disabled={checkInMutation.isPending || !profile?.id}
                className="gap-2"
                size="sm"
              >
                <LogIn className="h-4 w-4" />
                {checkInMutation.isPending ? "Checking in..." : "Check in now"}
              </Button>
            ) : !todayAtt?.check_out ? (
              <Button
                onClick={() => checkOutMutation.mutate()}
                disabled={checkOutMutation.isPending}
                variant="destructive"
                className="gap-2"
                size="sm"
              >
                <LogOut className="h-4 w-4" />
                {checkOutMutation.isPending ? "Checking out..." : "Check out now"}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Today's attendance completed</span>
              </div>
            )}
            {!todayShift && !todayAtt?.check_in && win.enforce_window && (
              <span className="text-xs text-muted-foreground">
                No shift assigned for today — check-in is disabled until an override is approved.
              </span>
            )}
            {todayWindow && !todayAtt?.check_out && (
              <span className="text-xs text-muted-foreground">
                Window: {format(todayWindow.earliestIn, "HH:mm")}–{format(todayWindow.latestOut, "HH:mm")}
                {win.enforce_window ? ` · grace ${win.grace_minutes}m` : " · enforcement off"}
                {win.source === "override" ? " · per-shift rule" : ""}
              </span>
            )}

          </div>

          {/* Punctuality alert for today */}
          {todayPunctuality && todayPunctuality.kind !== "ontime" && (
            <div
              className={cn(
                "mt-3 flex items-start gap-2 rounded-md border p-2.5 text-xs",
                todayPunctuality.kind === "late" && "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
                todayPunctuality.kind === "early" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                todayPunctuality.kind === "outside" && "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300",
              )}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Check-in {todayPunctuality.kind} the assigned shift window</div>
                <div className="opacity-90">
                  {todayPunctuality.label} · scheduled {todayShift?.start_time?.slice(0,5)}–{todayShift?.end_time?.slice(0,5)}
                  {todayAtt?.check_in ? `, you checked in at ${format(parseISO(todayAtt.check_in), "HH:mm")}` : ""}.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automated 4-day rotation self-view (3D perspective) */}
      <MyShiftRotationCalendar
        staffGroup={profile?.shift_group ?? null}
        staffName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || undefined}
        profileId={profile?.id ?? null}
        staffId={profile?.staff_id ?? null}
        roles={role ? [role] : null}
        departmentId={(profile as any)?.department_id ?? null}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Export monthly summary
          </CardTitle>
          <CardDescription>
            Download your {metrics.monthName} shift &amp; attendance summary as CSV or PDF with the filters below applied.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Scope</Label>
              <Select value={exportScope} onValueChange={(v) => setExportScope(v as typeof exportScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All days</SelectItem>
                  <SelectItem value="scheduled">Scheduled only</SelectItem>
                  <SelectItem value="worked">Worked (checked in)</SelectItem>
                  <SelectItem value="missed">Missed (scheduled, not in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Attendance status</Label>
              <Select value={exportStatus} onValueChange={(v) => setExportStatus(v as typeof exportStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="excused">Excused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Period</Label>
              <div className="h-9 px-3 rounded-md border bg-muted/30 flex items-center text-sm font-mono">
                {format(monthStart, "dd MMM")} – {format(monthEnd, "dd MMM yyyy")}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Badge variant="secondary" className="font-normal">
              {exportRows.length} record{exportRows.length === 1 ? "" : "s"} match
            </Badge>
            <ExportMenu
              label="Download summary"
              formats={["pdf", "csv"]}
              getData={buildExportPayload}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              {metrics.monthName}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            Week numbers on the left. Coloured dot = scheduled shift. Ring = checked-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Header row */}
                <div className="grid grid-cols-[40px_repeat(7,_minmax(0,1fr))] gap-1 mb-1">
                  <div />
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Weeks */}
                {Array.from({ length: days.length / 7 }).map((_, wIdx) => {
                  const weekDays = days.slice(wIdx * 7, wIdx * 7 + 7);
                  const wk = getISOWeek(weekDays[0]);
                  return (
                    <div key={wIdx} className="grid grid-cols-[40px_repeat(7,_minmax(0,1fr))] gap-1 mb-1">
                      <div className="flex items-center justify-center text-xs font-mono text-muted-foreground bg-muted/50 rounded">
                        W{wk}
                      </div>
                      {weekDays.map((d) => {
                        const key = format(d, "yyyy-MM-dd");
                        const entry = dateMap.get(key);
                        const inMonth = isSameMonth(d, cursor);
                        const today = isToday(d);
                        const hasShift = !!entry?.assignments.length;
                        const checkedIn = !!entry?.attendance?.check_in;
                        const completed = !!entry?.attendance?.check_in && !!entry?.attendance?.check_out;

                        let workedMins = 0;
                        if (entry?.attendance?.check_in && entry?.attendance?.check_out) {
                          workedMins = Math.max(
                            0,
                            differenceInMinutes(parseISO(entry.attendance.check_out), parseISO(entry.attendance.check_in)),
                          );
                        } else if (today && entry?.attendance?.check_in && !entry?.attendance?.check_out) {
                          workedMins = metrics.liveMinutes;
                        }

                        const punc = entry?.punctuality;
                        const puncRing =
                          punc?.kind === "late" ? "ring-1 ring-red-500/70" :
                          punc?.kind === "early" ? "ring-1 ring-amber-500/70" :
                          punc?.kind === "outside" ? "ring-1 ring-purple-500/70" : "";

                        return (
                          <div
                            key={key}
                            title={punc ? `${punc.label}` : undefined}
                            className={cn(
                              "relative h-20 rounded-md border p-1.5 text-xs flex flex-col transition-colors",
                              inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                              today && "ring-2 ring-primary",
                              !today && checkedIn && !punc && "ring-1 ring-emerald-500/60",
                              !today && puncRing,
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn("font-semibold", today && "text-primary")}>{format(d, "d")}</span>
                              <div className="flex items-center gap-1">
                                {punc && punc.kind !== "ontime" && (
                                  <AlertTriangle
                                    className={cn(
                                      "h-3 w-3",
                                      punc.kind === "late" && "text-red-500",
                                      punc.kind === "early" && "text-amber-500",
                                      punc.kind === "outside" && "text-purple-500",
                                    )}
                                    aria-label={punc.label}
                                  />
                                )}
                                {hasShift && (
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      profile?.shift_group === "A" && "bg-emerald-500",
                                      profile?.shift_group === "B" && "bg-sky-500",
                                      profile?.shift_group === "C" && "bg-amber-500",
                                      profile?.shift_group === "D" && "bg-violet-500",
                                      !profile?.shift_group && "bg-primary",
                                    )}
                                    aria-label="Scheduled"
                                  />
                                )}
                              </div>
                            </div>
                            {hasShift && (
                              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                {entry!.assignments[0].shifts?.name ?? "Shift"}
                              </div>
                            )}
                            {workedMins > 0 && (
                              <div className="mt-auto text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                {fmtMinutes(workedMins)}
                                {today && !completed && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Scheduled shift
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm ring-1 ring-emerald-500/60" /> Checked in
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-primary" /> Today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-red-500" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Early
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-purple-500" /> Outside window
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Shift change / override requests */}
      {profile?.id && user?.id && (
        <ShiftChangeRequestPanel
          profileId={profile.id}
          userId={user.id}
          shifts={allShifts}
          defaultDate={new Date()}
          defaultCurrentShiftId={todayEntry?.assignments[0]?.shift_id ?? null}
        />
      )}

      {/* Attendance time-edit requests */}
      {profile?.id && user?.id && (
        <AttendanceEditRequestPanel
          profileId={profile.id}
          userId={user.id}
          attendances={attendances}
        />
      )}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  live,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: string;
  live?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={cn("h-4 w-4", tone)} />
          <span className="truncate">{label}</span>
          {live && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        </div>
        <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, hint, live }: { label: string; value: string; hint?: string; live?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {label}
        {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      </div>
      <div className="font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
