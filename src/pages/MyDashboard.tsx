/**
 * Staff Portal — one place for an officer's own working week.
 *
 * Everything here is self-scoped: the clock, this week's hours, the officer's
 * own leave requests and the approval status of anything they submitted
 * (leave requests and profile change requests). No command-tier data is shown,
 * and RLS already limits every query below to the signed-in officer's rows.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import {
  LayoutDashboard,
  Timer,
  PlaneTakeoff,
  ClipboardCheck,
  CalendarDays,
  Fingerprint,
  ArrowRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logStaffAccess } from "@/lib/staff-access-log";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckInOut } from "@/components/attendance/CheckInOut";
import { MyHoursDashboard } from "@/components/attendance/MyHoursDashboard";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { MyLeaveHistory } from "@/components/leave/MyLeaveHistory";
import { formatDate } from "@/lib/date-format";
import { useMyDirectoryAccess } from "@/hooks/useDirectoryPermissions";

const MAX_DAILY_HOURS = 16;
const iso = (d: Date) => format(d, "yyyy-MM-dd");

type WeekRow = {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  check_in_method: string | null;
};

type LeaveRow = {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
};

type ChangeRow = {
  id: string;
  status: string;
  created_at: string;
  requested_changes: Record<string, unknown> | null;
};

function hoursOf(row: WeekRow): number {
  if (!row.check_in || !row.check_out) return 0;
  const ms = new Date(row.check_out).getTime() - new Date(row.check_in).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / 3_600_000, MAX_DAILY_HOURS);
}

function fmtTime(value: string | null) {
  return value ? format(new Date(value), "HH:mm") : "—";
}

function statusTone(status: string) {
  if (status === "approved") return "bg-emerald-600 text-white";
  if (status === "rejected" || status === "cancelled") return "bg-destructive text-destructive-foreground";
  return "bg-amber-500 text-white";
}

function statusLabel(status: string) {
  if (status === "supervisor_approved") return "With administrator";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function MyDashboard() {
  const { user } = useAuth();
  // Portal visibility follows the directory matrix View switch for the
  // officer's own hierarchy level (Settings → Directory Matrix).
  const { loading: accessLoading, canOpenPortal, denialReason } = useMyDirectoryAccess();
  const { data: profile } = useQuery({
    queryKey: ["portal-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const profileId = profile?.id ?? null;

  // Staff access log: record that this officer actually reached their portal.
  // Once per profile per page-load, and only when access was granted.
  const portalLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profileId || !canOpenPortal) return;
    if (portalLoggedRef.current === profileId) return;
    portalLoggedRef.current = profileId;
    void logStaffAccess("portal", profileId, "Opened own staff portal dashboard");
  }, [profileId, canOpenPortal]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart.getTime(), weekEnd.getTime()],
  );

  /** This week's own attendance records. */
  const { data: weekRows = [] } = useQuery({
    queryKey: ["portal-week-attendance", profileId, iso(weekStart)],
    enabled: !!profileId,
    queryFn: async (): Promise<WeekRow[]> => {
      const { data, error } = await supabase
        .from("attendances")
        .select("date, check_in, check_out, status, check_in_method")
        .eq("profile_id", profileId!)
        .gte("date", iso(weekStart))
        .lte("date", iso(weekEnd))
        .order("date");
      if (error) throw new Error(error.message);
      return (data ?? []) as WeekRow[];
    },
  });

  /** Own leave requests (most recent first). */
  const { data: leaveRows = [] } = useQuery({
    queryKey: ["portal-my-leave", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, type, start_date, end_date, status, created_at")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  /** Own profile change requests, so the officer can track their approvals. */
  const { data: changeRows = [] } = useQuery({
    queryKey: ["portal-my-change-requests", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<ChangeRow[]> => {
      const { data, error } = await supabase
        .from("profile_change_requests")
        .select("id, status, created_at, requested_changes")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChangeRow[];
    },
  });

  const weekByDate = useMemo(() => {
    const m = new Map<string, WeekRow>();
    for (const r of weekRows) if (!m.has(r.date)) m.set(r.date, r);
    return m;
  }, [weekRows]);

  const weekTotal = useMemo(() => weekRows.reduce((sum, r) => sum + hoursOf(r), 0), [weekRows]);
  const openSession = weekRows.find((r) => r.check_in && !r.check_out) ?? null;
  const biometricDays = weekRows.filter((r) => r.check_in_method === "biometric").length;

  const pendingLeave = leaveRows.filter((r) => r.status === "pending");
  const pendingChanges = changeRows.filter((r) => r.status === "pending" || r.status === "supervisor_approved");
  const pendingCount = pendingLeave.length + pendingChanges.length;

  if (accessLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Checking your access…</div>
    );
  }

  if (!canOpenPortal) {
    const unassigned = denialReason === "unassigned";
    return (
      <div className="space-y-6">
        <PageHeader icon={LayoutDashboard} title="Staff Portal" subtitle="Access restricted" />
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <p className="text-sm font-medium">
              {unassigned
                ? "You are not assigned to a command yet."
                : "The staff portal is not enabled for your role."}
            </p>
            <p className="text-sm text-muted-foreground">
              {unassigned
                ? "An administrator must post you to a command before the portal opens. This is a separate step from switching the portal on for your rank."
                : "An administrator can switch it on for your rank and command level."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Staff Portal"
        subtitle={`Your week at a glance${profile?.first_name ? ` — ${profile.first_name}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/my-profile">
                My profile <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/leave/calendar">Leave calendar</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/my-portal">My letters</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Hours this week</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-primary">{weekTotal.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(iso(weekStart))} – {formatDate(iso(weekEnd))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Days clocked in</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{weekRows.filter((r) => r.check_in).length}</p>
            <p className="text-xs text-muted-foreground">
              {openSession ? "One shift still open" : "No open shifts"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Awaiting approval</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">
              {pendingLeave.length} leave · {pendingChanges.length} profile change
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Fingerprint className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">Fingerprint clock-ins</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{biometricDays}</p>
            <p className="text-xs text-muted-foreground">Verified this week</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="clock" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="clock">Clock in / out</TabsTrigger>
          <TabsTrigger value="hours">My hours</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clock" className="space-y-4">
          <CheckInOut />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This week</CardTitle>
              <CardDescription>Your recorded clock-in and clock-out times.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Clock in</TableHead>
                    <TableHead>Clock out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => {
                    const row = weekByDate.get(iso(d));
                    return (
                      <TableRow key={iso(d)} className={isSameDay(d, today) ? "bg-muted/50" : undefined}>
                        <TableCell className="font-medium">{format(d, "EEE d MMM")}</TableCell>
                        <TableCell>{fmtTime(row?.check_in ?? null)}</TableCell>
                        <TableCell>{fmtTime(row?.check_out ?? null)}</TableCell>
                        <TableCell>
                          {row?.status ? (
                            <Badge variant="outline" className="capitalize">
                              {row.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No record</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row ? hoursOf(row).toFixed(2) : "0.00"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold">
                    <TableCell colSpan={4}>Week total</TableCell>
                    <TableCell className="text-right">{weekTotal.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <MyHoursDashboard />
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <LeaveRequestForm />
          <MyLeaveHistory />
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlaneTakeoff className="h-4 w-4" aria-hidden="true" /> Leave requests
              </CardTitle>
              <CardDescription>Where each of your requests currently sits.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {leaveRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have not submitted any leave requests.</p>
              ) : (
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="capitalize">{r.type}</TableCell>
                        <TableCell>{formatDate(r.start_date)}</TableCell>
                        <TableCell>{formatDate(r.end_date)}</TableCell>
                        <TableCell>{formatDate(r.created_at)}</TableCell>
                        <TableCell>
                          <Badge className={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Profile change requests
              </CardTitle>
              <CardDescription>
                Changes you submitted from My Profile, with the stage they have reached.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {changeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No change requests yet. Update your details from{" "}
                  <Link to="/my-profile" className="underline">
                    My Profile
                  </Link>
                  .
                </p>
              ) : (
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{formatDate(r.created_at)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Object.keys(r.requested_changes ?? {}).join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
