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
  BarChart3, Clock
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportReport, type ExportFormat, getFormatLabel } from "@/lib/export-utils";

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
const SEVERITY_COLORS: Record<string, string> = { low: "bg-blue-100 text-blue-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };
const STATUS_COLORS: Record<string, string> = { open: "bg-red-100 text-red-800", investigating: "bg-yellow-100 text-yellow-800", resolved: "bg-green-100 text-green-800", closed: "bg-gray-100 text-gray-800" };

type TimePeriod = "7d" | "30d" | "90d" | "12m";

export default function Analytics() {
  const { isAdmin, isAdminOrSupervisor, user } = useAuth();
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

  // Attendance data
  const { data: attendance = [] } = useQuery({
    queryKey: ["analytics-attendance", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendances")
        .select("date, status, check_in, check_out")
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

  // --- Computed analytics ---

  // Attendance trend
  const attendanceTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: periodStart, end: new Date() });
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayRecords = attendance.filter((a: any) => a.date === dayStr);
      return {
        date: format(day, "MMM dd"),
        present: dayRecords.filter((a: any) => a.status === "present").length,
        late: dayRecords.filter((a: any) => a.status === "late").length,
        absent: dayRecords.filter((a: any) => a.status === "absent").length,
        total: dayRecords.length,
      };
    }).filter((_, i) => period === "7d" || period === "30d" || i % (period === "90d" ? 7 : 30) === 0);
  }, [attendance, periodStart, period]);

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
        week: format(weekStart, "MMM dd"),
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

  // Build executive summary data
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
    subtitle: `Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Period: Last ${period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "90d" ? "90 days" : "12 months"}`,
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
    subtitle: `Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`,
  });

  const handleExportSummary = (fmt: ExportFormat) => {
    exportReport(fmt, getExecutiveSummaryData());
    toast.success(`Executive summary (${getFormatLabel(fmt)}) downloaded`);
  };

  const handleExportCompliance = (fmt: ExportFormat) => {
    exportReport(fmt, getComplianceData());
    toast.success(`Compliance report (${getFormatLabel(fmt)}) downloaded`);
  };

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
          <Button variant="outline" size="sm" onClick={exportExecutiveSummary} className="gap-1">
            <FileText className="h-4 w-4" /> Executive Summary
          </Button>
          <Button variant="outline" size="sm" onClick={exportComplianceReport} className="gap-1">
            <Download className="h-4 w-4" /> Compliance Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Users className="h-4 w-4" /> Active Staff</div>
            <div className="text-2xl font-bold mt-1">{activeStaff}<span className="text-sm text-muted-foreground font-normal">/{totalStaff}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CalendarCheck className="h-4 w-4" /> Attendance Rate</div>
            <div className="text-2xl font-bold mt-1 flex items-center gap-1">
              {avgAttendance}%
              {avgAttendance >= 80 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><AlertTriangle className="h-4 w-4" /> Open Incidents</div>
            <div className="text-2xl font-bold mt-1">{openIncidents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Shield className="h-4 w-4" /> Compliance Issues</div>
            <div className="text-2xl font-bold mt-1">{complianceSummary.expiredDocs + complianceSummary.expiredCerts}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="attendance" className="gap-1 text-xs"><Activity className="h-3 w-3" /> Attendance</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1 text-xs"><Clock className="h-3 w-3" /> Leave</TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" /> Incidents</TabsTrigger>
          <TabsTrigger value="overview" className="gap-1 text-xs"><PieIcon className="h-3 w-3" /> Overview</TabsTrigger>
        </TabsList>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="present" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Present" />
                  <Area type="monotone" dataKey="late" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Late" />
                  <Area type="monotone" dataKey="absent" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Absent" />
                </AreaChart>
              </ResponsiveContainer>
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
                        <TableCell className="text-xs">{format(new Date(inc.created_at), "dd MMM yyyy")}</TableCell>
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
        Analytics powered by GIS Amasaman Sector Command — Real-time data insights
      </p>
    </div>
  );
}
