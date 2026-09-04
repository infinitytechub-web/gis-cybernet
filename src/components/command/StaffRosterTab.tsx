/**
 * STAFF ROSTER — the command roster of people: photo, rank, roles, branch and
 * contact details, with patrol activity carried through from the patrol log.
 *
 * Rendered as a Command Console tab (whole command) and inside the Unit
 * Dashboard (scoped to one unit via the `orgUnitId` prop).
 *
 * Command-tier officers may designate role holders in place — OIC, 2IC,
 * Storekeeper, Procurement Officer and the rest — which is what unlocks the
 * patrol log, procurement and inventory modules for those staff.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Search, Phone, Mail, ShieldCheck, X, Footprints, ExternalLink, UserCog, CalendarCheck,
  Hourglass, LogIn, LogOut, CheckCircle2, AlertTriangle, Camera,
} from "lucide-react";
import { ExportMenu } from "@/components/ui/export-menu";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";
import {
  useStaffRoster, useGrantRole, useRevokeRole, useKeyAppointments, formatService,
  ROSTER_ASSIGNABLE_ROLES, KEY_APPOINTMENTS, type RosterMember,
} from "@/hooks/useStaffRoster";
import { useRosterClock, validateClockPhoto } from "@/hooks/useRosterClock";
import { RosterClockInForm } from "@/components/command/RosterClockInForm";
import { formatDate, formatDateTime } from "@/lib/date-format";

const STATUS_CLASS: Record<string, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  inactive: "border-destructive/40 bg-destructive/10 text-destructive",
  study_leave: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  transferred: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const ATTENDANCE_CLASS: Record<string, string> = {
  present: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  late: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  absent: "border-destructive/40 bg-destructive/10 text-destructive",
  excused: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";

interface Props {
  /** Restrict the roster to a single org unit (Unit Dashboard usage). */
  orgUnitId?: string;
  /** Optional branch name shown in the card description. */
  branchName?: string;
  /** Hide the key-appointment tiles (compact embedding). */
  compact?: boolean;
}

export default function StaffRosterTab({ orgUnitId, branchName, compact }: Props) {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const canManageRoles = Boolean(isAdmin || isAdminOrSupervisor);

  const { data: roster = [], isLoading } = useStaffRoster();
  const grant = useGrantRole();
  const revoke = useRevokeRole();
  const clock = useRosterClock();
  const [clockTarget, setClockTarget] = useState<{ member: RosterMember; action: "check_in" | "check_out" } | null>(null);
  const [clockReason, setClockReason] = useState("");
  const [clockPhoto, setClockPhoto] = useState<File | null>(null);

  /** Who this signed-in officer may clock: themselves, or anyone when command tier. */
  const canClock = (r: RosterMember) =>
    Boolean(canManageRoles || (r.user_id && user?.id && r.user_id === user.id));

  function openClock(r: RosterMember, action: "check_in" | "check_out") {
    setClockReason("");
    setClockPhoto(null);
    setClockTarget({ member: r, action });
  }

  async function submitClock() {
    if (!clockTarget) return;
    const { member, action } = clockTarget;
    const onBehalf = !(member.user_id && user?.id && member.user_id === user.id);
    if (onBehalf && !clockReason.trim()) {
      toast.error("A reason is required when clocking on behalf of another officer");
      return;
    }
    try {
      await clock.mutateAsync({
        profileId: member.id,
        action,
        reason: clockReason,
        photo: clockPhoto,
        name: member.full_name,
      });
      setClockTarget(null);
    } catch {
      /* toast raised by the hook */
    }
  }

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [branchFilter, setBranchFilter] = useState<string>(orgUnitId ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [attendanceFilter, setAttendanceFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [designating, setDesignating] = useState<RosterMember | null>(null);
  const [pendingRole, setPendingRole] = useState<AppRole | "">("");

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    roster.forEach((r) => {
      if (r.org_unit_id && r.branch) map.set(r.org_unit_id, r.branch);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [roster]);

  const scoped = useMemo(
    () => (orgUnitId ? roster.filter((r) => r.org_unit_id === orgUnitId) : roster),
    [roster, orgUnitId],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!orgUnitId && branchFilter !== "all" && r.org_unit_id !== branchFilter) return false;
      if (roleFilter !== "all" && !r.roles.includes(roleFilter)) return false;
      if (attendanceFilter === "unmarked" && r.attendance_today) return false;
      if (attendanceFilter !== "all" && attendanceFilter !== "unmarked"
        && r.attendance_today !== attendanceFilter) return false;
      if (serviceFilter !== "all") {
        if (serviceFilter === "unrecorded" && r.date_joined_service) return false;
        if (serviceFilter !== "unrecorded") {
          if (!r.date_joined_service) return false;
          const y = r.service_years;
          if (serviceFilter === "lt5" && y >= 5) return false;
          if (serviceFilter === "5to10" && (y < 5 || y >= 10)) return false;
          if (serviceFilter === "10to20" && (y < 10 || y >= 20)) return false;
          if (serviceFilter === "gte20" && y < 20) return false;
          if (serviceFilter === "retiring" && !(r.years_to_retirement !== null && r.years_to_retirement <= 2)) return false;
        }
      }
      if (!q) return true;
      return [r.full_name, r.staff_id, r.rank, r.branch, r.unit, r.phone, r.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [scoped, search, statusFilter, branchFilter, roleFilter, attendanceFilter, serviceFilter, orgUnitId]);

  /** Service (tenure) roll-up: average years and how many are near retirement. */
  const service = useMemo(() => {
    const withDate = scoped.filter((r) => r.date_joined_service);
    const total = withDate.reduce((s, r) => s + r.service_years + r.service_months / 12, 0);
    return {
      recorded: withDate.length,
      average: withDate.length ? total / withDate.length : null,
      retiringSoon: scoped.filter((r) => r.years_to_retirement !== null && r.years_to_retirement <= 2).length,
    };
  }, [scoped]);


  /** Today's attendance roll-up across the scoped roster. */
  const attendance = useMemo(() => {
    const active = scoped.filter((r) => r.status === "active");
    const present = active.filter((r) => r.attendance_today === "present").length;
    const late = active.filter((r) => r.attendance_today === "late").length;
    const absent = active.filter((r) => r.attendance_today === "absent").length;
    const excused = active.filter((r) => r.attendance_today === "excused").length;
    const marked = present + late + absent + excused;
    return {
      strength: active.length,
      present, late, absent, excused, marked,
      rate: active.length ? Math.round(((present + late) / active.length) * 100) : null,
    };
  }, [scoped]);

  const appointments = useKeyAppointments(scoped);

  async function applyRole() {
    if (!designating || !pendingRole) return;
    if (!designating.user_id) {
      toast.error("This staff member has no sign-in account yet — enable login first");
      return;
    }
    try {
      await grant.mutateAsync({ userId: designating.user_id, role: pendingRole });
      toast.success(`${designating.full_name} designated ${roleLabel(pendingRole)}`);
      setPendingRole("");
      setDesignating(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not designate role");
    }
  }

  async function dropRole(member: RosterMember, role: AppRole) {
    if (!member.user_id) return;
    try {
      await revoke.mutateAsync({ userId: member.user_id, role });
      toast.success(`${roleLabel(role)} withdrawn from ${member.full_name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not withdraw role");
    }
  }

  /** Rows the signed-in officer may clock, and their own row when on roster. */
  const clockable = useMemo(() => scoped.filter(canClock), [scoped, canManageRoles, user?.id]);
  const selfMember = useMemo(
    () => scoped.find((r) => r.user_id && user?.id && r.user_id === user.id) ?? null,
    [scoped, user?.id],
  );

  return (
    <div className="space-y-4">
      {/* ── Clock-in form: marks today's attendance ───────────────────────── */}
      {(clockable.length > 0 || selfMember) && (
        <RosterClockInForm
          clockable={clockable}
          canClockOthers={canManageRoles}
          selfMember={selfMember}
          summary={attendance}
        />
      )}


      {/* ── Key appointments: filled or vacant ───────────────────────────── */}
      {!compact && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Key appointments
            </CardTitle>
            <CardDescription>
              Designating these roles is what opens the patrol log, procurement and inventory
              modules to the officers holding them.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {appointments.map(({ role, holders }) => (
              <div key={role} className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ROLE_LABEL[role] ?? roleLabel(role)}
                </div>
                {holders.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">Vacant — designate a holder</p>
                ) : (
                  <ul className="space-y-1">
                    {holders.map((h) => (
                      <li key={h.id} className="flex items-center gap-2 text-sm">
                        <Avatar className="h-6 w-6">
                          {h.photo_signed_url && <AvatarImage src={h.photo_signed_url} alt="" />}
                          <AvatarFallback className="text-[10px]">{initials(h.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium">{h.full_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Roster table ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
              Staff roster
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{rows.length} of {scoped.length} staff{branchName ? ` — ${branchName}` : ""}</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <CalendarCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {attendance.rate === null ? "—" : `${attendance.rate}%`} on duty today
              </span>
              <span>
                {attendance.present} present · {attendance.late} late · {attendance.absent} absent ·{" "}
                {attendance.excused} excused · {Math.max(attendance.strength - attendance.marked, 0)} unmarked
              </span>
              <span className="inline-flex items-center gap-1">
                <Hourglass className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {service.average === null
                  ? "Service not recorded"
                  : `${service.average.toFixed(1)} yrs average service`}
                {service.retiringSoon > 0 ? ` · ${service.retiringSoon} retiring within 2 yrs` : ""}
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, staff ID, phone…"
                className="w-56 pl-8"
                aria-label="Search roster"
              />
            </div>
            {!orgUnitId && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-44" aria-label="Filter by branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-44" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROSTER_ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? roleLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="study_leave">Study leave</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={attendanceFilter} onValueChange={setAttendanceFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by attendance today">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any attendance</SelectItem>
                <SelectItem value="present">Present today</SelectItem>
                <SelectItem value="late">Late today</SelectItem>
                <SelectItem value="absent">Absent today</SelectItem>
                <SelectItem value="excused">Excused today</SelectItem>
                <SelectItem value="unmarked">Unmarked today</SelectItem>
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by years of service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any service</SelectItem>
                <SelectItem value="lt5">Under 5 years</SelectItem>
                <SelectItem value="5to10">5 – 10 years</SelectItem>
                <SelectItem value="10to20">10 – 20 years</SelectItem>
                <SelectItem value="gte20">20+ years</SelectItem>
                <SelectItem value="retiring">Retiring ≤ 2 years</SelectItem>
                <SelectItem value="unrecorded">Service unrecorded</SelectItem>
              </SelectContent>
            </Select>
            <ExportMenu
              label="Export roster"
              getData={() => ({
                title: "Staff Roster",
                filename: `staff_roster_${new Date().toISOString().slice(0, 10)}`,
                subtitle: `${branchName ?? "Whole command"} · ${rows.length} staff · Generated ${formatDateTime(new Date())}`,
                headers: [
                  "Staff ID", "Name", "Rank", "Branch", "Unit / department", "Roles",
                  "Phone", "Email", "Date joined service", "Years of service",
                  "Years to retirement", "Attendance today", "Patrols led", "Status",
                ],
                rows: rows.map((r) => [
                  r.staff_id ?? "—",
                  r.full_name,
                  r.rank ?? "—",
                  r.branch ?? "—",
                  r.unit ?? r.department ?? "—",
                  r.roles.map((role) => ROLE_LABEL[role] ?? roleLabel(role)).join(", ") || "None",
                  r.phone ?? "—",
                  r.email ?? "—",
                  r.date_joined_service
                    ? formatDate(r.date_joined_service)
                    : "—",
                  r.service_label ?? "—",
                  r.retired
                    ? "Retired"
                    : r.years_to_retirement === null ? "—" : String(r.years_to_retirement),
                  r.attendance_today ?? "Unmarked",
                  String(r.patrols_led),
                  (r.status ?? "—").replace(/_/g, " "),
                ]),
              })}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Branch / unit</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Service years</TableHead>
                    <TableHead>Attendance today</TableHead>
                    <TableHead>Clock in / out</TableHead>
                    <TableHead className="text-right">Patrols led</TableHead>
                    <TableHead>Status</TableHead>
                    {canManageRoles && <TableHead className="text-right">Designate</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9">
                            {r.photo_signed_url && <AvatarImage src={r.photo_signed_url} alt="" loading="lazy" />}
                            <AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Link
                              to={`/staff-directory?staff=${encodeURIComponent(r.staff_id ?? "")}`}
                              className="truncate font-medium hover:underline"
                            >
                              {r.full_name}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">{r.staff_id ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.rank ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.branch ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.unit ?? r.department ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.roles.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                          {r.roles.map((role) => (
                            <Badge key={role} variant="outline" className="gap-1 text-xs">
                              {ROLE_LABEL[role] ?? roleLabel(role)}
                              {canManageRoles && r.user_id && (
                                <button
                                  type="button"
                                  onClick={() => dropRole(r, role)}
                                  aria-label={`Withdraw ${roleLabel(role)} from ${r.full_name}`}
                                  className="rounded hover:text-destructive"
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" aria-hidden="true" />{r.phone}
                          </a>
                        )}
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-muted-foreground hover:underline">
                            <Mail className="h-3 w-3" aria-hidden="true" />{r.email}
                          </a>
                        )}
                        {!r.phone && !r.email && "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.date_joined_service ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <Hourglass className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                              {formatService(r.service_years, r.service_months)}
                            </span>
                            <div className="text-xs text-muted-foreground">
                              Joined {formatDate(r.date_joined_service)}
                            </div>
                            {r.retired ? (
                              <div className="text-xs text-destructive">Past retirement age</div>
                            ) : r.years_to_retirement !== null && r.years_to_retirement <= 2 ? (
                              <div className="text-xs text-amber-700 dark:text-amber-300">
                                Retires in {r.years_to_retirement}y
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not recorded</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.attendance_today ? (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className={ATTENDANCE_CLASS[r.attendance_today] ?? ""}>
                              {r.attendance_today}
                              {timeOf(r.attendance_check_in) ? ` · ${timeOf(r.attendance_check_in)}` : ""}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {r.attendance_days_30d > 0
                                ? `${r.attendance_present_30d}/${r.attendance_days_30d} days (30d)`
                                : "No 30-day record"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unmarked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!canClock(r) ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : r.attendance_check_out ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Out {timeOf(r.attendance_check_out)}
                          </span>
                        ) : r.attendance_check_in ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openClock(r, "check_out")}
                          >
                            <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Clock out
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => openClock(r, "check_in")}
                          >
                            <LogIn className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Clock in
                          </Button>
                        )}
                        {r.attendance_today === "late" && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Late arrival flagged
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.patrols_led > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Footprints className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            {r.patrols_led}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_CLASS[r.status ?? ""] ?? ""}>
                          {(r.status ?? "—").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      {canManageRoles && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setDesignating(r); setPendingRole(""); }}
                          >
                            <UserCog className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Role
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canManageRoles ? 11 : 10} className="py-8 text-center text-muted-foreground">
                        No staff match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {!compact && (
            <p className="mt-3 text-xs text-muted-foreground">
              Clocking in marks today's attendance automatically — arrivals past the shift start
              plus grace are flagged <span className="font-medium">late</span>, and clock-outs before
              the shift ends raise an early-departure alert. Patrol counts come from the patrol log.{" "}
              <Link to="/command-console?tab=dashboard" className="hover:underline">
                Command dashboard
              </Link>{" · "}
              <Link to="/unit-dashboard" className="inline-flex items-center gap-1 hover:underline">
                Unit dashboard <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Clock in / out ───────────────────────────────────────────────── */}
      <Dialog open={!!clockTarget} onOpenChange={(o) => !o && setClockTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {clockTarget?.action === "check_out" ? "Clock out" : "Clock in"}
              {clockTarget ? ` — ${clockTarget.member.full_name}` : ""}
            </DialogTitle>
            <DialogDescription>
              Attendance is marked automatically against the officer's shift window. A reason is
              required when clocking on another officer's behalf; a photo is optional proof of presence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="clock-reason">Reason / remarks</Label>
              <Textarea
                id="clock-reason"
                rows={3}
                value={clockReason}
                maxLength={500}
                placeholder="e.g. Reported at post, radio check completed"
                onChange={(e) => setClockReason(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="clock-photo">Photo (optional)</Label>
              <Input
                id="clock-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) {
                    const invalid = await validateClockPhoto(f);
                    if (invalid) {
                      toast.error(invalid);
                      e.target.value = "";
                      setClockPhoto(null);
                      return;
                    }
                  }
                  setClockPhoto(f);
                }}
              />
              {clockPhoto && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Camera className="h-3 w-3" aria-hidden="true" />
                  {clockPhoto.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClockTarget(null)}>Cancel</Button>
            <Button onClick={submitClock} disabled={clock.isPending}>
              {clock.isPending
                ? "Saving…"
                : clockTarget?.action === "check_out"
                  ? "Confirm clock out"
                  : "Confirm clock in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Designate role ───────────────────────────────────────────────── */}
      <Dialog open={!!designating} onOpenChange={(o) => !o && setDesignating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Designate role</DialogTitle>
            <DialogDescription>
              Grant {designating?.full_name} an operational role. Roles govern module access —
              Storekeeper unlocks inventory, Procurement Officer unlocks procurement approvals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select value={pendingRole} onValueChange={(v) => setPendingRole(v as AppRole)}>
              <SelectTrigger aria-label="Role to grant">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROSTER_ASSIGNABLE_ROLES.filter((r) => !designating?.roles.includes(r)).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r] ?? roleLabel(r)}
                    {KEY_APPOINTMENTS.includes(r) ? " — key appointment" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {designating && !designating.user_id && (
              <p className="text-xs text-destructive">
                This record has no sign-in account, so roles cannot be granted yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesignating(null)}>Cancel</Button>
            <Button onClick={applyRole} disabled={!pendingRole || grant.isPending || !designating?.user_id}>
              Designate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
