import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, CalendarCheck, CalendarOff, Calendar, ArrowRightLeft,
  Clock, UserCheck, UserX, TrendingUp, Building2, ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfWeek, addDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(160, 60%, 45%)",
  "hsl(40, 90%, 50%)",
  "hsl(0, 70%, 55%)",
  "hsl(200, 70%, 50%)",
];

export default function Dashboard() {
  const { isAdminOrSupervisor, isSupervisor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  const { data: staffCount = 0 } = useQuery({
    queryKey: ["staff-count"],
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: activeStaff = 0 } = useQuery({
    queryKey: ["active-staff-count"],
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "active");
      return count ?? 0;
    },
  });

  const { data: todayAttendance = 0 } = useQuery({
    queryKey: ["today-attendance"],
    queryFn: async () => {
      const { count } = await supabase.from("attendances").select("*", { count: "exact", head: true }).eq("date", today);
      return count ?? 0;
    },
  });

  const { data: pendingLeave = 0 } = useQuery({
    queryKey: ["pending-leave"],
    queryFn: async () => {
      const { count } = await supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
      return count ?? 0;
    },
  });

  const { data: pendingPostings = 0 } = useQuery({
    queryKey: ["pending-postings"],
    queryFn: async () => {
      const { count } = await supabase.from("postings_transfers").select("*", { count: "exact", head: true }).eq("status", "pending");
      return count ?? 0;
    },
  });

  const { data: upcomingHolidays = [] } = useQuery({
    queryKey: ["upcoming-holidays-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("name, date").gte("date", today).order("date").limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Weekly attendance data (last 7 days)
  const { data: weeklyAttendance = [] } = useQuery({
    queryKey: ["weekly-attendance"],
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));
      const { data, error } = await supabase
        .from("attendances")
        .select("date, status")
        .gte("date", days[0])
        .lte("date", days[6]);
      if (error) throw error;

      return days.map((d) => {
        const dayRecords = (data || []).filter((a) => a.date === d);
        return {
          day: format(new Date(d), "EEE"),
          present: dayRecords.filter((a) => a.status === "present").length,
          late: dayRecords.filter((a) => a.status === "late").length,
          absent: dayRecords.filter((a) => a.status === "absent").length,
        };
      });
    },
  });

  // Staff by department
  const { data: deptDistribution = [] } = useQuery({
    queryKey: ["dept-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id, departments(name)")
        .eq("status", "active");
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        const name = p.departments?.name || "Unassigned";
        counts[name] = (counts[name] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });

  // Recent leave requests
  const { data: recentLeave = [] } = useQuery({
    queryKey: ["recent-leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, type, status, start_date, end_date, profiles(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Staff status breakdown
  const { data: staffStatusData = [] } = useQuery({
    queryKey: ["staff-status-breakdown"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p) => {
        counts[p.status] = (counts[p.status] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
  });

  // Supervisor: pending approvals for their department
  const { data: supervisorPending } = useQuery({
    queryKey: ["supervisor-pending"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const [leaveRes, postingsRes] = await Promise.all([
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("postings_transfers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return { leave: leaveRes.count ?? 0, postings: postingsRes.count ?? 0 };
    },
  });

  const summaryCards = [
    { title: "Total Staff", value: staffCount, sub: `${activeStaff} active`, icon: Users, color: "text-primary" },
    { title: "On-Duty Today", value: todayAttendance, sub: `of ${activeStaff} active`, icon: CalendarCheck, color: "text-emerald-600" },
    { title: "Pending Leave", value: pendingLeave, sub: "awaiting approval", icon: CalendarOff, color: "text-amber-600" },
    { title: "Pending Postings", value: pendingPostings, sub: "awaiting approval", icon: ArrowRightLeft, color: "text-secondary" },
    { title: "Upcoming Holidays", value: upcomingHolidays.length, sub: "this year", icon: Calendar, color: "text-primary" },
    { title: "Absent Today", value: staffCount - todayAttendance, sub: "not checked in", icon: UserX, color: "text-destructive" },
  ];

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, dd MMMM yyyy")} · GIS Amasaman Sector Command</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-[10px] text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Supervisor Pending Approvals Widget */}
      {isAdminOrSupervisor && supervisorPending && (supervisorPending.leave > 0 || supervisorPending.postings > 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {isSupervisor && !isAdmin ? "Your Department — " : ""}Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {supervisorPending.leave > 0 && (
                <button
                  onClick={() => navigate("/leave")}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <CalendarOff className="h-6 w-6 text-amber-600" />
                  <div className="text-left">
                    <div className="text-xl font-bold">{supervisorPending.leave}</div>
                    <div className="text-xs text-muted-foreground">Leave requests</div>
                  </div>
                </button>
              )}
              {supervisorPending.postings > 0 && (
                <button
                  onClick={() => navigate("/postings")}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="h-6 w-6 text-secondary" />
                  <div className="text-left">
                    <div className="text-xl font-bold">{supervisorPending.postings}</div>
                    <div className="text-xs text-muted-foreground">Postings/Transfers</div>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Attendance Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Weekly Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyAttendance} barSize={20}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="present" stackId="a" fill="hsl(160, 60%, 45%)" name="Present" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" stackId="a" fill="hsl(40, 90%, 50%)" name="Late" radius={[0, 0, 0, 0]} />
                <Bar dataKey="absent" stackId="a" fill="hsl(0, 70%, 55%)" name="Absent" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Staff by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={deptDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                  labelLine={false}
                  fontSize={10}
                >
                  {deptDistribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Leave Requests */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-amber-600" />
              Recent Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeave.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No recent requests</TableCell></TableRow>
                ) : (
                  recentLeave.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</TableCell>
                      <TableCell className="text-sm capitalize">{r.type}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {format(new Date(r.start_date), "dd MMM")} – {format(new Date(r.end_date), "dd MMM")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${statusColor(r.status)}`}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Upcoming Holidays + Staff Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Upcoming Holidays
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming holidays</p>
              ) : (
                upcomingHolidays.map((h: any) => (
                  <div key={h.date} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate mr-2">{h.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(h.date), "dd MMM")}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                Staff Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {staffStatusData.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{s.name.replace("_", " ")}</span>
                  <Badge variant="outline" className="text-xs">{s.value}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
