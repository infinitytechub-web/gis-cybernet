import { Calendar, CalendarCheck, CalendarOff, Inbox, Info, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DashboardSection from "@/components/dashboard/DashboardSection";
import { KpiGrid, KpiTile } from "@/components/dashboard/KpiTile";
import { AnnouncementsBanner } from "@/components/announcements/AnnouncementsBanner";
import BirthdayWidget from "@/components/dashboard/BirthdayWidget";
import StaffQuickSearchWidget from "@/components/dashboard/StaffQuickSearchWidget";
import { usePersonalDashboardData } from "@/hooks/useDashboardData";

const statusTone = (s: string) =>
  s === "approved" ? "bg-success/15 text-success" : s === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning";

/**
 * Composition for staff and lower-privileged / non-staff functional roles.
 * Shows only personal duty information — no workforce totals, no security,
 * audit or system data.
 */
export default function StaffDashboard() {
  const { myLeave, myPendingLeave, myAttendanceToday, holidays } = usePersonalDashboardData();

  return (
    <>
      <DashboardSection id="key-figures" title="My key figures" icon={ListChecks}>
        <KpiGrid>
          <KpiTile
            title="Today's Duty"
            value={myAttendanceToday?.status ? String(myAttendanceToday.status) : "Not marked"}
            sub={format(new Date(), "dd/MM/yyyy")}
            icon={CalendarCheck}
            tone={myAttendanceToday ? "success" : "warning"}
          />
          <KpiTile title="My Pending Requests" value={myPendingLeave} sub="awaiting approval" icon={CalendarOff} tone="warning" />
          <KpiTile title="Upcoming Holidays" value={holidays.length} sub="next 5" icon={Calendar} tone="info" />
        </KpiGrid>
      </DashboardSection>

      <DashboardSection id="my-work" title="My work" description="Your own records and submissions." icon={Inbox}>
        <StaffQuickSearchWidget />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-warning" aria-hidden="true" />
              My leave / pass requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myLeave.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no recent requests.</p>
            ) : (
              myLeave.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="capitalize font-medium">{r.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.start_date), "dd/MM/yyyy")} – {format(new Date(r.end_date), "dd/MM/yyyy")}
                  </span>
                  <Badge variant="secondary" className={`text-xs ${statusTone(r.status)}`}>{r.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection id="information" title="Information" icon={Info} accent="text-cyan-700 dark:text-cyan-400">
        <div className="grid gap-4 lg:grid-cols-2">
          <AnnouncementsBanner />
          <BirthdayWidget />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
              Upcoming holidays
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {holidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming holidays</p>
            ) : (
              holidays.map((h: any) => (
                <div key={h.date} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium truncate">{h.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{format(new Date(h.date), "dd/MM/yyyy")}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </DashboardSection>
    </>
  );
}
