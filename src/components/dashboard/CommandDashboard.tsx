import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRightLeft, Building2, Calendar, CalendarCheck, CalendarOff,
  Info, ListChecks, TrendingUp, UserCheck, UserX, Users,
} from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardSection from "@/components/dashboard/DashboardSection";
import { KpiGrid, KpiTile } from "@/components/dashboard/KpiTile";
import { AnnouncementsBanner } from "@/components/announcements/AnnouncementsBanner";
import BirthdayWidget from "@/components/dashboard/BirthdayWidget";
import GenderStatisticsWidget from "@/components/dashboard/GenderStatisticsWidget";
import DailyOccurrencesWidget from "@/components/dashboard/DailyOccurrencesWidget";
import AttendanceLogWidget from "@/components/dashboard/AttendanceLogWidget";
import ProcessingQueueWidget from "@/components/dashboard/ProcessingQueueWidget";
import FrontDeskQueueWidget from "@/components/dashboard/FrontDeskQueueWidget";
import LowStockWidget from "@/components/dashboard/LowStockWidget";
import HealthLabWidget from "@/components/dashboard/HealthLabWidget";
import ApprovedReportsWidget from "@/components/dashboard/ApprovedReportsWidget";
import ScheduledReportsWidget from "@/components/dashboard/ScheduledReportsWidget";
import InterlinkWidget from "@/components/dashboard/InterlinkWidget";
import LiveGpsMapWidget from "@/components/dashboard/LiveGpsMapWidget";
import StaffAppraisalsWidget from "@/components/dashboard/StaffAppraisalsWidget";
import RetirementAlertWidget from "@/components/dashboard/RetirementAlertWidget";
import CommandTierAnalyticsTabs from "@/components/dashboard/CommandTierAnalyticsTabs";
import OnlineNowPanel from "@/components/dashboard/OnlineNowPanel";
import { useOversightDashboardData, usePersonalDashboardData } from "@/hooks/useDashboardData";
import { useRbac } from "@/hooks/useRbac";

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--success))",
  "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--info))",
];

const statusTone = (s: string) =>
  s === "approved" ? "bg-success/15 text-success" : s === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning";

/**
 * Command-tier composition: workforce oversight and the operational queues the
 * role owns. Security, audit and system-integrity widgets stay in the
 * administration composition.
 */
export default function CommandDashboard({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const { can } = useRbac();
  const { holidays } = usePersonalDashboardData();
  const { counts, weeklyAttendance, deptDistribution, recentLeave, staffStatus } = useOversightDashboardData(true);

  const c = counts ?? { staffCount: 0, activeStaff: 0, todayAttendance: 0, pendingLeave: 0, pendingPostings: 0 };
  const actionCount = c.pendingLeave + c.pendingPostings;

  return (
    <>
      <DashboardSection id="key-figures" title="Key figures" icon={ListChecks}>
        <KpiGrid>
          <KpiTile title="Total Staff" value={c.staffCount} sub={`${c.activeStaff} active`} icon={Users} tone="info" onClick={() => navigate("/staff")} />
          <KpiTile title="On-Duty Today" value={c.todayAttendance} sub={`of ${c.activeStaff} active`} icon={CalendarCheck} tone="success" onClick={() => navigate("/attendance")} />
          <KpiTile title="Absent Today" value={Math.max(0, c.activeStaff - c.todayAttendance)} sub="not checked in" icon={UserX} tone="danger" onClick={() => navigate("/attendance")} />
          <KpiTile title="Pending Leave" value={c.pendingLeave} sub="awaiting approval" icon={CalendarOff} tone="warning" onClick={() => navigate("/leave")} />
          <KpiTile title="Pending Postings" value={c.pendingPostings} sub="awaiting approval" icon={ArrowRightLeft} tone="warning" onClick={() => navigate("/postings")} />
          <KpiTile title="Upcoming Holidays" value={holidays.length} sub="next 5" icon={Calendar} tone="neutral" onClick={() => navigate("/holidays")} />
        </KpiGrid>
      </DashboardSection>

      {actionCount > 0 && (
        <DashboardSection id="action-needed" title="Action needed" description="Items waiting on your decision." icon={CalendarOff} accent="text-warning">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-wrap gap-4 pt-6">
              {c.pendingLeave > 0 && (
                <button onClick={() => navigate("/leave")} className="flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/50">
                  <CalendarOff className="h-6 w-6 text-warning" aria-hidden="true" />
                  <span className="text-left">
                    <span className="block text-xl font-bold">{c.pendingLeave}</span>
                    <span className="block text-xs text-muted-foreground">Leave requests</span>
                  </span>
                </button>
              )}
              {c.pendingPostings > 0 && (
                <button onClick={() => navigate("/postings")} className="flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/50">
                  <ArrowRightLeft className="h-6 w-6 text-secondary" aria-hidden="true" />
                  <span className="text-left">
                    <span className="block text-xl font-bold">{c.pendingPostings}</span>
                    <span className="block text-xs text-muted-foreground">Postings / transfers</span>
                  </span>
                </button>
              )}
            </CardContent>
          </Card>
        </DashboardSection>
      )}

      {/* Administration-only band, injected by the page for admin/OIC/2IC. */}
      {children}

      <DashboardSection id="operations" title="Operations" description="Live activity for the units you oversee." icon={Activity}>
        <DailyOccurrencesWidget />
        {can("attendance") && <AttendanceLogWidget />}
        {can("processing") && <ProcessingQueueWidget />}
        {can("front-desk") && <FrontDeskQueueWidget />}
        {can("health-lab") && <HealthLabWidget />}
        {can("reports") && <ApprovedReportsWidget variant="standard" />}
        {can("reports") && <ApprovedReportsWidget variant="ipse" />}
        {can("scheduled-files") && <ScheduledReportsWidget />}
        {can("staff") && <RetirementAlertWidget />}
        {can("analytics") && <CommandTierAnalyticsTabs />}

      </DashboardSection>

      <DashboardSection id="workforce" title="Workforce analytics" icon={TrendingUp}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                Weekly attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyAttendance} barSize={20}>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="present" stackId="a" fill="hsl(var(--success))" name="Present" />
                  <Bar dataKey="late" stackId="a" fill="hsl(var(--warning))" name="Late" />
                  <Bar dataKey="absent" stackId="a" fill="hsl(var(--destructive))" name="Absent" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Aggregated only — the full per-department allocation breakdown is
              restricted to the Admin Console. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Workforce spread
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xl font-bold tabular-nums">{deptDistribution.length}</div>
                <p className="text-xs text-muted-foreground">departments staffed</p>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">{c.activeStaff}</div>
                <p className="text-xs text-muted-foreground">active staff</p>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">
                  {deptDistribution.length ? Math.round(c.activeStaff / deptDistribution.length) : 0}
                </div>
                <p className="text-xs text-muted-foreground">average per department</p>
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-3">
                Detailed department allocations are available in the Admin Console.
              </p>
            </CardContent>
          </Card>

        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-warning" aria-hidden="true" />
                Recent leave requests
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
                    <TableRow><TableCell colSpan={4} className="py-4 text-center text-muted-foreground">No recent requests</TableCell></TableRow>
                  ) : (
                    recentLeave.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</TableCell>
                        <TableCell className="text-sm capitalize">{r.type}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                          {format(new Date(r.start_date), "dd/MM/yyyy")} – {format(new Date(r.end_date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell><Badge variant="secondary" className={`text-xs ${statusTone(r.status)}`}>{r.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-success" aria-hidden="true" />
                Staff status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {staffStatus.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{String(s.name).replace("_", " ")}</span>
                  <Badge variant="outline" className="text-xs">{s.value}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DashboardSection>

      <DashboardSection id="information" title="Information" icon={Info} accent="text-cyan-700 dark:text-cyan-400">
        <div className="grid gap-4 lg:grid-cols-2">
          <AnnouncementsBanner />
          <BirthdayWidget />
        </div>
        <GenderStatisticsWidget />
      </DashboardSection>
    </>
  );
}
