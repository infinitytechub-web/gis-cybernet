import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, CalendarCheck, AlertTriangle,
  Shield, FileText, Download, Plus, Activity, PieChart as PieIcon,
  BarChart3, Clock, UserCog
} from "lucide-react";
import type { AppRole } from "@/lib/types";
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/export-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandTierAnalyticsTabs from "@/components/dashboard/CommandTierAnalyticsTabs";

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
const SEVERITY_COLORS: Record<string, string> = { low: "bg-blue-100 text-blue-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };
const STATUS_COLORS: Record<string, string> = { open: "bg-red-100 text-red-800", investigating: "bg-yellow-100 text-yellow-800", resolved: "bg-green-100 text-green-800", closed: "bg-gray-100 text-gray-800" };

// Friendly labels + display order for AppRole
const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  oic: "OIC",
  "2ic": "2IC",
  head_of_administration: "Head of Administration",
  chief_staff_officer: "Chief Staff Officer",
  command_officer: "Command Officer",
  me_officer: "M&E Officer",
  project_manager: "Project Manager",
  field_officer: "Field Officer",
  head_of_processing: "Head of Processing",
  deputy_head_of_processing: "Deputy Head of Processing",
  staff_officer: "Staff Officer",
  supervisor: "Supervisor",
  ipse_supervisor: "IPSE Supervisor",
  ipse_deputy_supervisor: "IPSE Deputy Supervisor",
  shift_supervisor: "Shift Supervisor",
  deputy_shift_supervisor: "Deputy Shift Supervisor",
  shift_leader: "Shift Leader",
  deputy_supervisor: "Deputy Supervisor",
  deputy_shift_leader: "Deputy Shift Leader",
  special_duties: "Special Duties",
  deputy: "Deputy",
  front_desk: "Front Desk",
  official: "Official",
  enquiry: "Enquiry",
  storekeeper: "Storekeeper",
  procurement_officer: "Procurement Officer",
  medical_officer: "Medical Officer",
  staff: "Staff",
};
const ROLE_ORDER: AppRole[] = [
  "admin","oic","2ic","head_of_administration","chief_staff_officer","command_officer","me_officer","project_manager","field_officer","staff_officer","supervisor",
  "ipse_supervisor","ipse_deputy_supervisor",
  "shift_supervisor","deputy_shift_supervisor","shift_leader","deputy_shift_leader","deputy_supervisor",
  "special_duties","deputy",
  "front_desk","official","enquiry","storekeeper","procurement_officer",
  "staff",
];

type TimePeriod = "7d" | "30d" | "90d" | "12m";

export default function Analytics() {
  const { isAdmin, isAdminOrSupervisor, user } = useAuth();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<TimePeriod>("30d");
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    title: "", description: "", incident_type: "other", severity: "medium", location: "",
  });

  const periodStart = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "7d": return subDays(now, 7);
      case "30d": return subDays(now, 30);
      case "90d": return subDays(now, 90);
      case "12m": return subMonths(now, 12);
    }
  }, [period]);

  // Attendance data (with department info)
  const { data: attendance = [] } = useQuery({
    queryKey: ["analytics-attendance", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendances")
        .select("date, status, check_in, check_out, profile_id, profiles(department_id, departments(name))")
        .gte("date", format(periodStart, "yyyy-MM-dd"))
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  // Leave data
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["analytics-leave", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests")
        .select("type, status, start_date, end_date, created_at")
        .gte("created_at", periodStart.toISOString())
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Staff stats
  const { data: staffStats } = useQuery({
    queryKey: ["analytics-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("status, department_id, departments(name), gender, shift_group");
      if (error) throw error;
      return data;
    },
  });

  // Incidents
  const { data: incidents = [], refetch: refetchIncidents } = useQuery({
    queryKey: ["analytics-incidents", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_incidents")
        .select("*")
        .gte("created_at", periodStart.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Compliance data
  const { data: complianceData } = useQuery({
    queryKey: ["analytics-compliance"],
    queryFn: async () => {
      const [docs, certs, equip] = await Promise.all([
        supabase.from("staff_documents").select("expiry_date, status"),
        supabase.from("certifications").select("expiry_date, status"),
        supabase.from("equipment_issuance").select("condition, returned_date"),
      ]);
      return { documents: docs.data || [], certifications: certs.data || [], equipment: equip.data || [] };
    },
  });

  // User roles distribution (with profile info for active filtering + dept breakdown)
  const { data: rolesData = [] } = useQuery({
    queryKey: ["analytics-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, user_id, profiles!user_roles_user_id_fkey(status, gender, departments(name))");
      if (error) {
        // Fallback if relationship name differs
        const { data: simple } = await supabase.from("user_roles").select("role, user_id");
        return (simple || []).map((r: any) => ({ ...r, profiles: null }));
      }
      return data || [];
    },
  });

  // --- Computed analytics ---

  // Attendance trend
  const attendanceTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: periodStart, end: new Date() });
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayRecords = attendance.filter((a: any) => a.date === dayStr);
      return {
        date: format(day, "dd MMM"),
        present: dayRecords.filter((a: any) => a.status === "present").length,
        late: dayRecords.filter((a: any) => a.status === "late").length,
        absent: dayRecords.filter((a: any) => a.status === "absent").length,
        total: dayRecords.length,
      };
    }).filter((_, i) => period === "7d" || period === "30d" || i % (period === "90d" ? 7 : 30) === 0);
  }, [attendance, periodStart, period]);

  // Weekly attendance comparison (week-over-week)
  const weeklyComparison = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: periodStart, end: new Date() });
    const weekData = weeks.map((ws) => {
      const we = endOfWeek(ws);
      const days = eachDayOfInterval({ start: ws, end: we > new Date() ? new Date() : we });
      const weekRecords = days.flatMap((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        return attendance.filter((a: any) => a.date === dayStr);
      });
      const present = weekRecords.filter((a: any) => a.status === "present").length;
      const late = weekRecords.filter((a: any) => a.status === "late").length;
      const absent = weekRecords.filter((a: any) => a.status === "absent").length;
      const total = present + late + absent;
      return { week: format(ws, "dd MMM"), present, late, absent, total, rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0 };
    });
    return weekData.map((w, i) => ({ ...w, change: i > 0 ? w.rate - weekData[i - 1].rate : 0 }));
  }, [attendance, periodStart]);

  // Department attendance breakdown
  const deptAttendance = useMemo(() => {
    const depts: Record<string, { present: number; late: number; absent: number; total: number }> = {};
    attendance.forEach((a: any) => {
      const deptName = a.profiles?.departments?.name || "Unassigned";
      if (!depts[deptName]) depts[deptName] = { present: 0, late: 0, absent: 0, total: 0 };
      depts[deptName].total++;
      if (a.status === "present") depts[deptName].present++;
      else if (a.status === "late") depts[deptName].late++;
      else if (a.status === "absent") depts[deptName].absent++;
    });
    return Object.entries(depts)
      .map(([name, d]) => ({ name, ...d, rate: d.total > 0 ? Math.round(((d.present + d.late) / d.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [attendance]);

  // Department sparklines (weekly rate trends)
  const deptSparklines = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: periodStart, end: new Date() });
    const deptNames = [...new Set(attendance.map((a: any) => a.profiles?.departments?.name || "Unassigned"))];
    return deptNames.map((dept) => {
      const points = weeks.map((ws) => {
        const we = endOfWeek(ws);
        const days = eachDayOfInterval({ start: ws, end: we > new Date() ? new Date() : we });
        const recs = days.flatMap((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          return attendance.filter((a: any) => a.date === dayStr && (a.profiles?.departments?.name || "Unassigned") === dept);
        });
        const total = recs.length;
        const onTime = recs.filter((a: any) => a.status === "present" || a.status === "late").length;
        return { week: format(ws, "dd/MM"), rate: total > 0 ? Math.round((onTime / total) * 100) : 0 };
      });
      const latest = points[points.length - 1]?.rate ?? 0;
      const prev = points.length > 1 ? points[points.length - 2]?.rate ?? 0 : latest;
      return { dept, points, latest, trend: latest >= prev ? "up" : "down" as const };
    }).sort((a, b) => b.latest - a.latest);
  }, [attendance, periodStart]);

  // Leave by type
  const leaveByType = useMemo(() => {
    const types: Record<string, number> = {};
    leaveRequests.forEach((l: any) => { types[l.type] = (types[l.type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [leaveRequests]);

  // Leave status distribution
  const leaveByStatus = useMemo(() => {
    const statuses: Record<string, number> = {};
    leaveRequests.forEach((l: any) => { statuses[l.status] = (statuses[l.status] || 0) + 1; });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [leaveRequests]);

  // Incident trend
  const incidentTrend = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: periodStart, end: new Date() });
    return weeks.map(weekStart => {
      const we = endOfWeek(weekStart);
      const weekIncidents = incidents.filter((inc: any) => {
        const d = new Date(inc.created_at);
        return d >= weekStart && d <= we;
      });
      return {
        week: format(weekStart, "dd MMM"),
        total: weekIncidents.length,
        critical: weekIncidents.filter((i: any) => i.severity === "critical").length,
        high: weekIncidents.filter((i: any) => i.severity === "high").length,
      };
    });
  }, [incidents, periodStart]);

  // Incident by type
  const incidentsByType = useMemo(() => {
    const types: Record<string, number> = {};
    incidents.forEach((i: any) => { types[i.incident_type] = (types[i.incident_type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [incidents]);

  // Department distribution
  const deptDistribution = useMemo(() => {
    if (!staffStats) return [];
    const depts: Record<string, number> = {};
    staffStats.forEach((s: any) => {
      const name = s.departments?.name || "Unassigned";
      depts[name] = (depts[name] || 0) + 1;
    });
    return Object.entries(depts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [staffStats]);

  // Compliance summary
  const complianceSummary = useMemo(() => {
    if (!complianceData) return { expiredDocs: 0, expiringSoon: 0, totalDocs: 0, expiredCerts: 0, totalCerts: 0, issuedEquip: 0 };
    const now = new Date();
    const soon = subDays(now, -30);
    const expiredDocs = complianceData.documents.filter((d: any) => d.expiry_date && new Date(d.expiry_date) < now).length;
    const expiringSoon = complianceData.documents.filter((d: any) => d.expiry_date && new Date(d.expiry_date) >= now && new Date(d.expiry_date) <= soon).length;
    const expiredCerts = complianceData.certifications.filter((c: any) => c.expiry_date && new Date(c.expiry_date) < now).length;
    const issuedEquip = complianceData.equipment.filter((e: any) => !e.returned_date).length;
    return { expiredDocs, expiringSoon, totalDocs: complianceData.documents.length, expiredCerts, totalCerts: complianceData.certifications.length, issuedEquip };
  }, [complianceData]);

  // Role-type statistics
  const rolesStats = useMemo(() => {
    const counts: Record<string, number> = {};
    const activeCounts: Record<string, number> = {};
    const inactiveCounts: Record<string, number> = {};
    const deptByRole: Record<string, Record<string, number>> = {};
    rolesData.forEach((r: any) => {
      const role = r.role as string;
      counts[role] = (counts[role] || 0) + 1;
      const status = r.profiles?.status;
      if (status === "active") activeCounts[role] = (activeCounts[role] || 0) + 1;
      else if (status) inactiveCounts[role] = (inactiveCounts[role] || 0) + 1;
      const dept = r.profiles?.departments?.name || "Unassigned";
      if (!deptByRole[role]) deptByRole[role] = {};
      deptByRole[role][dept] = (deptByRole[role][dept] || 0) + 1;
    });
    const total = rolesData.length;
    const rows = ROLE_ORDER
      .filter((role) => counts[role])
      .map((role) => ({
        role,
        label: ROLE_LABELS[role],
        count: counts[role] || 0,
        active: activeCounts[role] || 0,
        inactive: inactiveCounts[role] || 0,
        pct: total ? Math.round(((counts[role] || 0) / total) * 100) : 0,
        topDept: Object.entries(deptByRole[role] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
      }));
    // Append any unknown roles not in our order
    Object.keys(counts).forEach((role) => {
      if (!ROLE_ORDER.includes(role as AppRole)) {
        rows.push({
          role: role as AppRole,
          label: role.replace(/_/g, " "),
          count: counts[role],
          active: activeCounts[role] || 0,
          inactive: inactiveCounts[role] || 0,
          pct: total ? Math.round((counts[role] / total) * 100) : 0,
          topDept: Object.entries(deptByRole[role] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
        });
      }
    });
    const commandTier = (counts.admin || 0) + (counts.oic || 0) + (counts["2ic"] || 0) + (counts.staff_officer || 0) + (counts.supervisor || 0);
    const shiftTier = (counts.shift_supervisor || 0) + (counts.deputy_shift_supervisor || 0) + (counts.shift_leader || 0) + (counts.deputy_shift_leader || 0) + (counts.deputy_supervisor || 0);
    const ipseTier = (counts.ipse_supervisor || 0) + (counts.ipse_deputy_supervisor || 0);
    const operationsTier = (counts.front_desk || 0) + (counts.official || 0) + (counts.enquiry || 0) + (counts.storekeeper || 0) + (counts.procurement_officer || 0);
    const generalStaff = counts.staff || 0;
    return { rows, total, commandTier, shiftTier, ipseTier, operationsTier, generalStaff };
  }, [rolesData]);

  // KPI cards
  const totalStaff = staffStats?.length || 0;
  const activeStaff = staffStats?.filter((s: any) => s.status === "active").length || 0;
  const avgAttendance = attendanceTrend.length > 0
    ? Math.round(attendanceTrend.reduce((s, d) => s + d.present + d.late, 0) / Math.max(attendanceTrend.reduce((s, d) => s + d.total, 0), 1) * 100)
    : 0;
  const openIncidents = incidents.filter((i: any) => i.status === "open" || i.status === "investigating").length;

  // Create incident
  const handleCreateIncident = async () => {
    if (!incidentForm.title.trim()) { toast.error("Title is required"); return; }
    const { error } = await supabase.from("security_incidents").insert({
      ...incidentForm,
      reported_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incident reported");
    setIncidentDialogOpen(false);
    setIncidentForm({ title: "", description: "", incident_type: "other", severity: "medium", location: "" });
    refetchIncidents();
  };

  const getExecutiveSummaryData = () => ({
    title: "Executive Summary Report",
    filename: `GIS_ASC_Executive_Summary_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Metric", "Value"],
    rows: [
      ["Total Staff", String(totalStaff)],
      ["Active Staff", String(activeStaff)],
      ["Attendance Rate", `${avgAttendance}%`],
      ["Open Incidents", String(openIncidents)],
      ["Pending Leave Requests", String(leaveRequests.filter((l: any) => l.status === "pending").length)],
      ["Expired Documents", String(complianceSummary.expiredDocs)],
      ["Expired Certifications", String(complianceSummary.expiredCerts)],
    ],
    subtitle: `Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")} | Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"}`,
  });

  const getComplianceData = () => ({
    title: "Compliance Report",
    filename: `GIS_ASC_Compliance_Report_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Category", "Total", "Expired", "Expiring Soon", "Status"],
    rows: [
      ["Staff Documents", String(complianceSummary.totalDocs), String(complianceSummary.expiredDocs), String(complianceSummary.expiringSoon), complianceSummary.expiredDocs > 0 ? "Action Required" : "Compliant"],
      ["Certifications", String(complianceSummary.totalCerts), String(complianceSummary.expiredCerts), "—", complianceSummary.expiredCerts > 0 ? "Action Required" : "Compliant"],
      ["Equipment Issued", String(complianceSummary.issuedEquip), "—", "—", "Tracked"],
    ],
    subtitle: `Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")}`,
  });

  const getDeptAttendanceData = () => ({
    title: "Department Attendance Breakdown",
    filename: `GIS_ASC_Dept_Attendance_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Department", "Present", "Late", "Absent", "Total", "Rate (%)"],
    rows: deptAttendance.map((d) => [d.name, String(d.present), String(d.late), String(d.absent), String(d.total), `${d.rate}%`]),
    subtitle: `Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"} | Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")}`,
  });

  const getAttendanceTrendData = () => ({
    title: "Attendance Trend Analysis",
    filename: `GIS_ASC_Attendance_Trend_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Date", "Present", "Late", "Absent", "Total"],
    rows: attendanceTrend.map((d) => [d.date, String(d.present), String(d.late), String(d.absent), String(d.total)]),
    subtitle: `Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"} | Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")}`,
  });

  const getWeeklyComparisonData = () => ({
    title: "Week-over-Week Attendance Comparison",
    filename: `GIS_ASC_Weekly_Comparison_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Week", "Present", "Late", "Absent", "Total", "Rate (%)", "Change (%)"],
    rows: weeklyComparison.map((w) => [w.week, String(w.present), String(w.late), String(w.absent), String(w.total), `${w.rate}%`, `${w.change > 0 ? "+" : ""}${w.change}%`]),
    subtitle: `Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"} | Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")}`,
  });

  const getDeptSparklineData = () => ({
    title: "Department Rate Trends",
    filename: `GIS_ASC_Dept_Rate_Trends_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Department", "Latest Rate (%)", "Trend", ...( deptSparklines[0]?.points.map(p => `W/${p.week}`) ?? [])],
    rows: deptSparklines.map((d) => [d.dept, `${d.latest}%`, d.trend === "up" ? "↑" : "↓", ...d.points.map(p => `${p.rate}%`)]),
    subtitle: `Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"} | Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")}`,
  });

  const getRolesData = () => ({
    title: "Role Type Statistics",
    filename: `GIS_ASC_Role_Statistics_${format(new Date(), "yyyy-MM-dd")}`,
    headers: ["Role", "Total", "Active", "Inactive", "Share (%)", "Top Department"],
    rows: rolesStats.rows.map((r) => [r.label, String(r.count), String(r.active), String(r.inactive), `${r.pct}%`, r.topDept]),
    subtitle: `Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")} | Total Assigned Roles: ${rolesStats.total}`,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-secondary">Analytics & Insights</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <ExportMenu label="Executive Summary" getData={getExecutiveSummaryData} />
          <ExportMenu label="Compliance Report" getData={getComplianceData} />
        </div>
      </div>

      {/* Postings & Transfers — HR Analytics (Command tier + Admin) */}
      {isAdminOrSupervisor && <CommandTierAnalyticsTabs />}


      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs"><Users className="h-4 w-4" /> Active Staff</div>
            <div className="text-2xl font-bold mt-1">{activeStaff}<span className="text-sm text-muted-foreground font-normal">/{totalStaff}</span></div>
          </CardContent>
        </Card>
        <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs"><CalendarCheck className="h-4 w-4" /> Attendance Rate</div>
            <div className="text-2xl font-bold mt-1 flex items-center gap-1">
              {avgAttendance}%
              {avgAttendance >= 80 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs"><AlertTriangle className="h-4 w-4" /> Open Incidents</div>
            <div className="text-2xl font-bold mt-1">{openIncidents}</div>
          </CardContent>
        </Card>
        <Card className="border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs"><Shield className="h-4 w-4" /> Compliance Issues</div>
            <div className="text-2xl font-bold mt-1">{complianceSummary.expiredDocs + complianceSummary.expiredCerts}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="attendance" className="gap-1 text-xs"><Activity className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Attendance</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1 text-xs"><Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" /> Leave</TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" /> Incidents</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1 text-xs"><UserCog className="h-3 w-3 text-cyan-600 dark:text-cyan-400" /> Roles</TabsTrigger>
          <TabsTrigger value="overview" className="gap-1 text-xs"><PieIcon className="h-3 w-3 text-indigo-600 dark:text-indigo-400" /> Overview</TabsTrigger>
        </TabsList>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4 mt-4">
          {/* Summary stat cards */}
          {(() => {
            const totalPresent = attendanceTrend.reduce((s, d) => s + d.present, 0);
            const totalLate = attendanceTrend.reduce((s, d) => s + d.late, 0);
            const totalAbsent = attendanceTrend.reduce((s, d) => s + d.absent, 0);
            const totalAll = totalPresent + totalLate + totalAbsent;
            const pctPresent = totalAll ? Math.round((totalPresent / totalAll) * 100) : 0;
            const pctLate = totalAll ? Math.round((totalLate / totalAll) * 100) : 0;
            const pctAbsent = totalAll ? Math.round((totalAbsent / totalAll) * 100) : 0;
            const peakDay = attendanceTrend.reduce((best, d) => d.total > best.total ? d : best, attendanceTrend[0] || { date: "—", total: 0 });
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Present</div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalPresent}</div>
                    <div className="text-[10px] text-muted-foreground">{pctPresent}% of total</div>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardContent className="p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Late</div>
                    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalLate}</div>
                    <div className="text-[10px] text-muted-foreground">{pctLate}% of total</div>
                  </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-800">
                  <CardContent className="p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Absent</div>
                    <div className="text-xl font-bold text-red-600 dark:text-red-400">{totalAbsent}</div>
                    <div className="text-[10px] text-muted-foreground">{pctAbsent}% of total</div>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 dark:border-blue-800">
                  <CardContent className="p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Peak Day</div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{peakDay.total}</div>
                    <div className="text-[10px] text-muted-foreground">{peakDay.date}</div>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Attendance Trend Analysis
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {period === "7d" ? "Daily" : period === "30d" ? "Daily" : period === "90d" ? "Weekly" : "Monthly"}
                </Badge>
                <ExportMenu iconOnly variant="ghost" className="h-6 w-6" getData={getAttendanceTrendData} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={attendanceTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Area type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} fill="url(#gradPresent)" name="Present" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} fill="url(#gradLate)" name="Late" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} fill="url(#gradAbsent)" name="Absent" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Total" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Weekly Comparison Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Week-over-Week Attendance Comparison
                <Badge variant="outline" className="ml-auto text-[10px]">{weeklyComparison.length} weeks</Badge>
                <ExportMenu iconOnly variant="ghost" className="h-6 w-6" getData={getWeeklyComparisonData} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyComparison} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="barLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="barAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                    formatter={(value: any, name: string, props: any) => {
                      if (name === "Att. Rate") return [`${value}%`, name];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="present" fill="url(#barPresent)" name="Present" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="late" fill="url(#barLate)" name="Late" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absent" fill="url(#barAbsent)" name="Absent" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Att. Rate" />
                </BarChart>
              </ResponsiveContainer>

              {/* Week-over-week change indicators */}
              {weeklyComparison.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {weeklyComparison.slice(1).map((w, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-border/50 bg-muted/30">
                      <span className="text-muted-foreground">{w.week}</span>
                      {w.change > 0 ? (
                        <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                          <TrendingUp className="h-3 w-3 mr-0.5" />+{w.change}%
                        </span>
                      ) : w.change < 0 ? (
                        <span className="flex items-center text-red-600 dark:text-red-400 font-medium">
                          <TrendingDown className="h-3 w-3 mr-0.5" />{w.change}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">0%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department Attendance Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                Department Attendance Breakdown
                <Badge variant="outline" className="ml-auto text-[10px]">{deptAttendance.length} depts</Badge>
                <ExportMenu variant="ghost" className="h-6 px-2 text-[10px]" getData={getDeptAttendanceData} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, deptAttendance.length * 40 + 40)}>
                <BarChart data={deptAttendance} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                    formatter={(value: any, name: string) => {
                      if (name === "Rate") return [`${value}%`, name];
                      return [value, name];
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="present" stackId="a" fill="#10b981" name="Present" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" />
                  <Bar dataKey="absent" stackId="a" fill="#ef4444" name="Absent" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Attendance rate badges per department */}
              <div className="mt-3 flex flex-wrap gap-2">
                {deptAttendance.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border border-border/50 bg-muted/30">
                    <span className="text-muted-foreground font-medium truncate max-w-[80px]">{d.name}</span>
                    <span className={`font-bold ${d.rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : d.rate >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {d.rate}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Department Rate Trend Sparklines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-500" />
                Department Rate Trends
                <Badge variant="outline" className="ml-auto text-[10px]">{deptSparklines.length} depts</Badge>
                <ExportMenu iconOnly variant="ghost" className="h-6 w-6" getData={getDeptSparklineData} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {deptSparklines.map((d) => (
                  <div key={d.dept} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-medium truncate">{d.dept}</span>
                        {d.trend === "up" ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                        )}
                        <span className={`text-[10px] font-bold ml-auto ${d.latest >= 80 ? "text-emerald-600 dark:text-emerald-400" : d.latest >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                          {d.latest}%
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={36}>
                        <LineChart data={d.points}>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                              fontSize: "10px",
                              padding: "4px 8px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                            }}
                            formatter={(value: any) => [`${value}%`, "Rate"]}
                            labelFormatter={(label: string) => `Week of ${label}`}
                          />
                          <Line
                            type="monotone"
                            dataKey="rate"
                            stroke={d.latest >= 80 ? "#10b981" : d.latest >= 60 ? "#f59e0b" : "#ef4444"}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 3, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Tab */}
        <TabsContent value="leave" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leave by Type</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={leaveByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {leaveByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leave Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={leaveByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Security & Compliance Incidents</h3>
            <Dialog open={incidentDialogOpen} onOpenChange={setIncidentDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Report Incident</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Report New Incident</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title *</Label><Input value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Type</Label>
                      <Select value={incidentForm.incident_type} onValueChange={(v) => setIncidentForm({ ...incidentForm, incident_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="security_breach">Security Breach</SelectItem>
                          <SelectItem value="policy_violation">Policy Violation</SelectItem>
                          <SelectItem value="unauthorized_access">Unauthorized Access</SelectItem>
                          <SelectItem value="equipment_damage">Equipment Damage</SelectItem>
                          <SelectItem value="attendance_anomaly">Attendance Anomaly</SelectItem>
                          <SelectItem value="safety_hazard">Safety Hazard</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Severity</Label>
                      <Select value={incidentForm.severity} onValueChange={(v) => setIncidentForm({ ...incidentForm, severity: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Location</Label><Input value={incidentForm.location} onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} rows={3} /></div>
                  <Button onClick={handleCreateIncident} className="w-full">Submit Incident Report</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Incident Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={incidentTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" name="Total" strokeWidth={2} />
                    <Line type="monotone" dataKey="critical" stroke="#ef4444" name="Critical" strokeWidth={2} />
                    <Line type="monotone" dataKey="high" stroke="#f59e0b" name="High" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Incidents by Type</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={incidentsByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {incidentsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Incidents table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No incidents reported</TableCell></TableRow>
                    ) : incidents.slice(0, 20).map((inc: any) => (
                      <TableRow key={inc.id}>
                        <TableCell className="font-medium text-sm">{inc.title}</TableCell>
                        <TableCell className="text-xs capitalize">{inc.incident_type.replace(/_/g, " ")}</TableCell>
                        <TableCell><Badge className={`text-xs ${SEVERITY_COLORS[inc.severity] || ""}`}>{inc.severity}</Badge></TableCell>
                        <TableCell><Badge className={`text-xs ${STATUS_COLORS[inc.status] || ""}`}>{inc.status}</Badge></TableCell>
                        <TableCell className="text-xs">{format(new Date(inc.created_at), "dd/MM/yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles Tab — statistics by role type */}
        <TabsContent value="roles" className="space-y-4 mt-4">
          {/* Tier summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Command Tier</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{rolesStats.commandTier}</div>
                <div className="text-[10px] text-muted-foreground">Admin · OIC · 2IC · SO · Supv</div>
              </CardContent>
            </Card>
            <Card className="border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Shift Leadership</div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{rolesStats.shiftTier}</div>
                <div className="text-[10px] text-muted-foreground">Shift Supv · Leaders</div>
              </CardContent>
            </Card>
            <Card className="border-lime-300 dark:border-lime-700 bg-lime-50/50 dark:bg-lime-950/20">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">IPSE</div>
                <div className="text-xl font-bold text-lime-600 dark:text-lime-400">{rolesStats.ipseTier}</div>
                <div className="text-[10px] text-muted-foreground">Supervisors & Deputies</div>
              </CardContent>
            </Card>
            <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Operations</div>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{rolesStats.operationsTier}</div>
                <div className="text-[10px] text-muted-foreground">Front Desk · Stores · Proc</div>
              </CardContent>
            </Card>
            <Card className="border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/20">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">General Staff</div>
                <div className="text-xl font-bold text-slate-600 dark:text-slate-400">{rolesStats.generalStaff}</div>
                <div className="text-[10px] text-muted-foreground">Standard personnel</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Role distribution pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-cyan-500" />
                  Role Distribution
                  <Badge variant="outline" className="ml-auto text-[10px]">{rolesStats.total} assigned</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-visible">
                <ResponsiveContainer width="100%" height={isMobile ? 340 : 300}>
                  <PieChart margin={{ top: 12, right: 12, bottom: 8, left: 12 }}>
                    <Pie
                      data={rolesStats.rows.map((r) => ({ name: r.label, value: r.count }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy={isMobile ? "42%" : "45%"}
                      innerRadius={isMobile ? "32%" : "38%"}
                      outerRadius={isMobile ? "55%" : "62%"}
                      paddingAngle={2}
                      labelLine={false}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                        if (!percent || percent < 0.05) return null;
                        const RAD = Math.PI / 180;
                        // On mobile, render labels INSIDE slices to avoid clipping
                        if (isMobile) {
                          const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                          const x = cx + r * Math.cos(-midAngle * RAD);
                          const y = cy + r * Math.sin(-midAngle * RAD);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="#fff"
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{ fontSize: 10, fontWeight: 600 }}
                            >
                              {`${(percent * 100).toFixed(0)}%`}
                            </text>
                          );
                        }
                        // Desktop: outside labels with name + percent
                        const r = outerRadius + 14;
                        const x = cx + r * Math.cos(-midAngle * RAD);
                        const y = cy + r * Math.sin(-midAngle * RAD);
                        const anchor = x > cx ? "start" : "end";
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="hsl(var(--foreground))"
                            textAnchor={anchor}
                            dominantBaseline="central"
                            style={{ fontSize: 10, fontWeight: 500 }}
                          >
                            {`${name} ${(percent * 100).toFixed(0)}%`}
                          </text>
                        );
                      }}
                    >
                      {rolesStats.rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      formatter={(value: number, name: string) => [`${value} staff`, name]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                      formatter={(value, entry: any) => {
                        const v = entry?.payload?.value;
                        return (
                          <span style={{ color: "hsl(var(--foreground))" }}>
                            {value}{typeof v === "number" ? ` (${v})` : ""}
                          </span>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Role bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-500" />
                  Headcount by Role
                  <Badge variant="outline" className="ml-auto text-[10px]">{rolesStats.rows.length} role types</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(220, rolesStats.rows.length * 26 + 40)}>
                  <BarChart data={rolesStats.rows} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={130} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="active" stackId="a" fill="#10b981" name="Active" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="inactive" stackId="a" fill="#94a3b8" name="Inactive" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Role breakdown table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCog className="h-4 w-4 text-cyan-500" />
                Role Type Breakdown
                <Badge variant="outline" className="ml-auto text-[10px]">{rolesStats.rows.length} roles</Badge>
                <ExportMenu iconOnly variant="ghost" className="h-6 w-6" getData={getRolesData} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs text-center">Total</TableHead>
                      <TableHead className="text-xs text-center">Active</TableHead>
                      <TableHead className="text-xs text-center">Inactive</TableHead>
                      <TableHead className="text-xs text-center">Share</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Top Department</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rolesStats.rows.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No roles assigned</TableCell></TableRow>
                    ) : rolesStats.rows.map((r) => (
                      <TableRow key={r.role}>
                        <TableCell className="font-medium text-sm py-1.5">{r.label}</TableCell>
                        <TableCell className="text-center py-1.5">
                          <Badge variant="secondary" className="text-[11px] px-2">{r.count}</Badge>
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{r.active}</span>
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <span className="text-xs text-muted-foreground">{r.inactive}</span>
                        </TableCell>
                        <TableCell className="text-center py-1.5">
                          <span className="text-xs font-medium">{r.pct}%</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell py-1.5 truncate max-w-[180px]">{r.topDept}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Staff by Department</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={deptDistribution.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Compliance Overview</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Documents</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{complianceSummary.totalDocs} total</Badge>
                    {complianceSummary.expiredDocs > 0 && <Badge variant="destructive">{complianceSummary.expiredDocs} expired</Badge>}
                    {complianceSummary.expiringSoon > 0 && <Badge className="bg-yellow-100 text-yellow-800">{complianceSummary.expiringSoon} expiring</Badge>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Certifications</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{complianceSummary.totalCerts} total</Badge>
                    {complianceSummary.expiredCerts > 0 && <Badge variant="destructive">{complianceSummary.expiredCerts} expired</Badge>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Equipment Issued</span>
                  <Badge variant="outline">{complianceSummary.issuedEquip} active</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-center text-muted-foreground">
        Analytics powered by Cybernet HRM System — Real-time data insights
      </p>
    </div>
  );
}
