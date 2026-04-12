import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, CalendarCheck, CalendarOff, Calendar, ArrowRightLeft,
  Clock, UserCheck, UserX, TrendingUp, Building2, ShieldCheck,
  Activity, Shield, Wifi
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfWeek, addDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { AnnouncementsBanner } from "@/components/announcements/AnnouncementsBanner";
import ScheduledReportsWidget from "@/components/dashboard/ScheduledReportsWidget";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--info))",
];

export default function Dashboard() {
  const { isAdminOrSupervisor, isSupervisor, isAdmin } = useAuth();
  const { onlineUsers, onlineCount } = useOnlineUsers();
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

      const counts: Record<string, { value: number; id: string }> = {};
      (data || []).forEach((p: any) => {
        const name = p.departments?.name || "Unassigned";
        const id = p.department_id || "unassigned";
        if (!counts[name]) counts[name] = { value: 0, id };
        counts[name].value += 1;
      });

      return Object.entries(counts)
        .map(([name, { value, id }]) => ({ name, value, id }))
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

  // System health metrics (admin only)
  const { data: systemHealth } = useQuery({
    queryKey: ["system-health"],
    enabled: isAdmin,
    queryFn: async () => {
      const [profilesRes, withAccountRes, deptsRes, ranksRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, user_id, department_id, rank_id, phone", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("user_id", "is", null),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("ranks").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }),
      ]);

      const profiles = profilesRes.data || [];
      const totalProfiles = profilesRes.count ?? 0;
      const withAccounts = withAccountRes.count ?? 0;
      const missingDept = profiles.filter(p => !p.department_id).length;
      const missingRank = profiles.filter(p => !p.rank_id).length;
      const missingPhone = profiles.filter(p => !p.phone).length;

      return {
        totalProfiles,
        withAccounts,
        loginCoverage: totalProfiles > 0 ? Math.round((withAccounts / totalProfiles) * 100) : 0,
        departments: deptsRes.count ?? 0,
        ranks: ranksRes.count ?? 0,
        roleAssignments: rolesRes.count ?? 0,
        missingDept,
        missingRank,
        missingPhone,
        dataCompleteness: totalProfiles > 0 
          ? Math.round(((totalProfiles * 3 - missingDept - missingRank - missingPhone) / (totalProfiles * 3)) * 100) 
          : 0,
      };
    },
  });

  const summaryCards = [
    { title: "Total Staff", value: staffCount, sub: `${activeStaff} active`, icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800" },
    { title: "On-Duty Today", value: todayAttendance, sub: `of ${activeStaff} active`, icon: CalendarCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
    { title: "Pending Leave", value: pendingLeave, sub: "awaiting approval", icon: CalendarOff, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
    { title: "Pending Postings", value: pendingPostings, sub: "awaiting approval", icon: ArrowRightLeft, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-200 dark:border-purple-800" },
    { title: "Upcoming Holidays", value: upcomingHolidays.length, sub: "this year", icon: Calendar, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800" },
    { title: "Absent Today", value: staffCount - todayAttendance, sub: "not checked in", icon: UserX, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800" },
  ];

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-success/15 text-success";
      case "rejected": return "bg-destructive/15 text-destructive";
      default: return "bg-warning/15 text-warning";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, dd MMMM yyyy")} · Ghana Immigration Service - Cybernet</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((card) => (
          <Card key={card.title} className={`${card.bg} ${card.border} border-2`}>
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

      {/* Announcements */}
      <AnnouncementsBanner />

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
                  <CalendarOff className="h-6 w-6 text-warning" />
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

      {/* System Health Widget (Admin only) */}
      {isAdmin && systemHealth && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              System Health & Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> Login Accounts
                </div>
                <div className="text-xl font-bold">{systemHealth.withAccounts}<span className="text-sm font-normal text-muted-foreground">/{systemHealth.totalProfiles}</span></div>
                <Progress value={systemHealth.loginCoverage} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">{systemHealth.loginCoverage}% coverage</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" /> Role Assignments
                </div>
                <div className="text-xl font-bold">{systemHealth.roleAssignments}</div>
                <p className="text-[10px] text-muted-foreground">{systemHealth.departments} depts · {systemHealth.ranks} ranks</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wifi className="h-3 w-3" /> Data Completeness
                </div>
                <div className="text-xl font-bold">{systemHealth.dataCompleteness}%</div>
                <Progress value={systemHealth.dataCompleteness} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">profiles filled</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Missing Data
                </div>
                <div className="space-y-0.5 text-xs">
                  {systemHealth.missingDept > 0 && <p className="text-warning">{systemHealth.missingDept} no department</p>}
                  {systemHealth.missingRank > 0 && <p className="text-warning">{systemHealth.missingRank} no rank</p>}
                  {systemHealth.missingPhone > 0 && <p className="text-warning">{systemHealth.missingPhone} no phone</p>}
                  {systemHealth.missingDept === 0 && systemHealth.missingRank === 0 && systemHealth.missingPhone === 0 && (
                    <p className="text-success">All complete ✓</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Reports Widget (Admin/Supervisor) */}
      {isAdminOrSupervisor && <ScheduledReportsWidget />}

      {/* Online Users Widget */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            Online Now
            <Badge variant="outline" className="ml-auto text-[10px]">{onlineCount} user{onlineCount !== 1 ? "s" : ""}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {onlineCount === 0 ? (
            <p className="text-sm text-muted-foreground">No users currently online</p>
          ) : (
            <ScrollArea className="max-h-[120px]">
              <div className="flex flex-wrap gap-2">
                {onlineUsers.map((u) => {
                  const isNightGuard = u.department?.toLowerCase().includes("night guard");
                  return (
                    <div key={u.userId} className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 ${isNightGuard ? "bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400" : "bg-accent/50"}`}>
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className={`text-[10px] ${isNightGuard ? "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100" : "bg-primary/10 text-primary"}`}>
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{u.firstName} {u.lastName}</span>
                      {isNightGuard && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-400">
                          <Shield className="h-2.5 w-2.5 mr-0.5" />
                          Night Guard
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

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
                <Bar dataKey="present" stackId="a" fill="hsl(var(--success))" name="Present" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" stackId="a" fill="hsl(var(--warning))" name="Late" radius={[0, 0, 0, 0]} />
                <Bar dataKey="absent" stackId="a" fill="hsl(var(--destructive))" name="Absent" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Staff Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Staff by Department
              <Badge variant="outline" className="ml-auto text-[10px]">{deptDistribution.length} depts</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[280px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Department</TableHead>
                  <TableHead className="text-xs text-right w-16">Count</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Distribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptDistribution.map((dept, i) => {
                  const maxVal = deptDistribution[0]?.value || 1;
                  const pct = Math.round((dept.value / (activeStaff || 1)) * 100);
                  return (
                    <TableRow
                      key={dept.name}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => navigate(`/directory?dept=${dept.id}`)}
                    >
                      <TableCell className="text-xs font-medium py-1.5 text-primary underline-offset-2 hover:underline">{dept.name}</TableCell>
                      <TableCell className="text-xs text-right py-1.5 font-semibold">{dept.value}</TableCell>
                      <TableCell className="hidden sm:table-cell py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(dept.value / maxVal) * 100}%`,
                                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8">{pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Leave Requests */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-warning" />
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
                upcomingHolidays.map((h: any, idx: number) => {
                  const holidayColors = [
                    "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800",
                    "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
                    "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
                    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
                    "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
                  ];
                  return (
                    <div key={h.date} className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 border ${holidayColors[idx % holidayColors.length]}`}>
                      <span className="font-medium truncate mr-2">{h.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{format(new Date(h.date), "dd MMM")}</Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-success" />
                Staff Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {staffStatusData.map((s: any) => {
                const isActive = s.name === "active";
                const isInactive = s.name === "inactive" || s.name === "transferred";
                return (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      ) : isInactive ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                      ) : (
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                      )}
                      <span className="text-sm capitalize">{s.name.replace("_", " ")}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{s.value}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
