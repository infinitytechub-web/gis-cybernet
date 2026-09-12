/**
 * Leave Calendar — one row per staff member, one column per day of the chosen
 * month, showing approved leave (and pending requests) as coloured bars.
 *
 * Drag-and-drop:
 *  - Drag across empty days in your own row (command tier: any row) to start a
 *    new leave request with those dates pre-filled.
 *  - Drag a pending bar sideways to move the request to different dates.
 *  - Approved / rejected bars are read-only.
 *
 * Row visibility comes from the database policies on `leave_requests`:
 * the command tier sees the whole command, everyone else sees only their own.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { CalendarDays, ChevronLeft, ChevronRight, MousePointer2, PlaneTakeoff } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { format, startOfMonth, endOfMonth, addMonths, eachDayOfInterval, isSameDay, differenceInCalendarDays, addDays, isWeekend } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { countLeaveDays, isLeaveHoliday, type HolidayDate } from "@/lib/leave-days";

type LeaveType = Database["public"]["Enums"]["leave_type"];

const CELL = 34; // px per day column — drag offsets are measured against this
const iso = (d: Date) => format(d, "yyyy-MM-dd");

const TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "compassionate", label: "Compassionate Leave" },
  { value: "pass", label: "Pass" },
  { value: "study", label: "Study Leave" },
  { value: "maternity", label: "Maternity Leave" },
];

const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;

const barTone = (status: string) =>
  status === "approved"
    ? "bg-emerald-500/85 text-white"
    : status === "pending"
    ? "bg-amber-400/90 text-amber-950"
    : "bg-destructive/70 text-destructive-foreground";

interface LeaveRow {
  id: string;
  profile_id: string;
  type: string;
  status: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  profiles: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
}

interface DragState {
  kind: "select" | "move";
  profileId: string;
  /** select: anchor + current day index. move: request id, original range, day delta. */
  anchor?: number;
  current?: number;
  requestId?: string;
  startX?: number;
  delta?: number;
  origStart?: string;
  origEnd?: string;
}

export default function LeaveCalendar() {
  const { user, isAdminOrSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const from = iso(month);
  const to = iso(endOfMonth(month));
  const days = useMemo(() => eachDayOfInterval({ start: month, end: endOfMonth(month) }), [month]);

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: leave = [], isLoading } = useQuery({
    queryKey: ["leave-calendar", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, profile_id, type, status, start_date, end_date, reason, profiles!leave_requests_profile_id_fkey(first_name, last_name, staff_id)")
        .lte("start_date", to)
        .gte("end_date", from)
        .order("start_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["leave-calendar-holidays", format(month, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("date, recurring");
      if (error) throw new Error(error.message);
      return (data ?? []) as HolidayDate[];
    },
  });

  const blockedDay = useCallback((day: Date) => isWeekend(day) || isLeaveHoliday(day, holidays), [holidays]);

  /** Staff rows: everyone with leave this month, plus always your own row. */
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; staffId: string | null }>();
    if (myProfile) {
      map.set(myProfile.id, {
        id: myProfile.id,
        name: `${myProfile.first_name ?? ""} ${myProfile.last_name ?? ""}`.trim() || "You",
        staffId: myProfile.staff_id ?? null,
      });
    }
    for (const r of leave) {
      if (map.has(r.profile_id)) continue;
      map.set(r.profile_id, {
        id: r.profile_id,
        name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Staff",
        staffId: r.profiles?.staff_id ?? null,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [leave, myProfile]);

  const byProfile = useMemo(() => {
    const out: Record<string, LeaveRow[]> = {};
    for (const r of leave) (out[r.profile_id] ??= []).push(r);
    return out;
  }, [leave]);

  const canEditRow = useCallback(
    (profileId: string) => isAdminOrSupervisor || profileId === myProfile?.id,
    [isAdminOrSupervisor, myProfile?.id]
  );
  const canMove = useCallback(
    (r: LeaveRow) => r.status === "pending" && (isAdminOrSupervisor || r.profile_id === myProfile?.id),
    [isAdminOrSupervisor, myProfile?.id]
  );

  // ── New request dialog ──────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formProfileId, setFormProfileId] = useState<string | null>(null);
  const [type, setType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const openNew = (profileId: string, s: string, e: string) => {
    setFormProfileId(profileId);
    setStartDate(s);
    setEndDate(e);
    setType("annual");
    setReason("");
    setDialogOpen(true);
  };

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!formProfileId) throw new Error("No staff member selected");
      if (!startDate || !endDate) throw new Error("Please pick both dates");
      if (new Date(endDate) < new Date(startDate)) throw new Error("End date must be on or after the start date");
      if (type === "annual" && (blockedDay(new Date(`${startDate}T00:00:00`)) || blockedDay(new Date(`${endDate}T00:00:00`)))) {
        throw new Error("Annual leave must start and end on a working day");
      }
      const { error } = await supabase.from("leave_requests").insert({
        profile_id: formProfileId,
        type,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      setDialogOpen(false);
      toast.success("Leave request submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveRequest = useMutation({
    mutationFn: async ({ id, start, end }: { id: string; start: string; end: string }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ start_date: start, end_date: end })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["leave-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success(`Moved to ${format(new Date(v.start), "d MMM")} – ${format(new Date(v.end), "d MMM")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Drag handling ───────────────────────────────────────────────────────────
  const setDragState = (s: DragState | null) => {
    dragRef.current = s;
    setDrag(s);
  };

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    setDragState(null);
    if (!d) return;
    if (d.kind === "select" && d.anchor != null && d.current != null) {
      const a = Math.min(d.anchor, d.current);
      const b = Math.max(d.anchor, d.current);
      openNew(d.profileId, iso(days[a]), iso(days[b]));
    }
    if (d.kind === "move" && d.requestId && d.origStart && d.origEnd && d.delta) {
      const request = leave.find((row) => row.id === d.requestId);
      const movedStart = addDays(new Date(`${d.origStart}T00:00:00`), d.delta);
      const movedEnd = addDays(new Date(`${d.origEnd}T00:00:00`), d.delta);
      if (request?.type === "annual" && (blockedDay(movedStart) || blockedDay(movedEnd))) {
        toast.error("Annual leave must start and end on a working day");
        return;
      }
      moveRequest.mutate({
        id: d.requestId,
        start: iso(movedStart),
        end: iso(movedEnd),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedDay, days, leave, moveRequest]);

  const onCellDown = (profileId: string, dayIndex: number) => (e: React.PointerEvent) => {
    if (!canEditRow(profileId) || blockedDay(days[dayIndex])) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragState({ kind: "select", profileId, anchor: dayIndex, current: dayIndex });
  };

  const onCellEnter = (profileId: string, dayIndex: number) => () => {
    const d = dragRef.current;
    if (d?.kind === "select" && d.profileId === profileId && !blockedDay(days[dayIndex])) {
      setDragState({ ...d, current: dayIndex });
    }
  };

  const onBarDown = (r: LeaveRow) => (e: React.PointerEvent) => {
    if (!canMove(r)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      kind: "move",
      profileId: r.profile_id,
      requestId: r.id,
      startX: e.clientX,
      delta: 0,
      origStart: r.start_date,
      origEnd: r.end_date,
    });
  };

  const onGridMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d?.kind === "move" && d.startX != null) {
      const delta = Math.round((e.clientX - d.startX) / CELL);
      if (delta !== d.delta) setDragState({ ...d, delta });
    }
  };

  /** Selection highlight for the in-progress drag. */
  const inSelection = (profileId: string, dayIndex: number) => {
    if (drag?.kind !== "select" || drag.profileId !== profileId) return false;
    const a = Math.min(drag.anchor!, drag.current!);
    const b = Math.max(drag.anchor!, drag.current!);
    return dayIndex >= a && dayIndex <= b;
  };

  /** Bar geometry inside the month window, including any live move offset. */
  const barGeometry = (r: LeaveRow) => {
    const shift = drag?.kind === "move" && drag.requestId === r.id ? (drag.delta ?? 0) : 0;
    const s = addDays(new Date(`${r.start_date}T00:00:00`), shift);
    const e = addDays(new Date(`${r.end_date}T00:00:00`), shift);
    const startIdx = Math.max(0, differenceInCalendarDays(s, month));
    const endIdx = Math.min(days.length - 1, differenceInCalendarDays(e, month));
    if (endIdx < 0 || startIdx > days.length - 1) return null;
    return {
      left: startIdx * CELL,
      width: (endIdx - startIdx + 1) * CELL - 4,
      shifted: shift !== 0,
      start: iso(s),
      end: iso(e),
    };
  };

  const approvedDays = useMemo(
    () =>
      leave
        .filter((r) => r.status === "approved")
        .reduce((sum, r) => {
          const s = new Date(`${r.start_date}T00:00:00`);
          const e = new Date(`${r.end_date}T00:00:00`);
          const a = s < month ? month : s;
          const b = e > endOfMonth(month) ? endOfMonth(month) : e;
          return sum + countLeaveDays(iso(a), iso(b), r.type, holidays);
        }, 0),
    [holidays, leave, month]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Calendar"
        subtitle="Approved leave dates per staff member. Drag across days to request leave, or drag a pending bar to move it."
        icon={CalendarDays}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-secondary">
              <PlaneTakeoff className="h-5 w-5 text-primary" />
              {format(month, "MMMM yyyy")}
            </CardTitle>
            <CardDescription>
              {rows.length} staff · {approvedDays} approved entitlement day(s) this month
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>This month</Button>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" asChild>
              <Link to="/leave">Leave requests</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-emerald-500/85" /> Approved</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-amber-400/90" /> Pending (draggable)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-destructive/70" /> Rejected</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border bg-muted/80" /> Weekend / holiday</span>
            <span className="flex items-center gap-1.5"><MousePointer2 className="h-3.5 w-3.5" /> Drag empty days to request leave</span>
          </div>

          <div className="overflow-x-auto">
            <div
              className="min-w-[700px] select-none"
              onPointerMove={onGridMove}
              onPointerUp={finishDrag}
              onPointerLeave={() => dragRef.current?.kind === "move" && finishDrag()}
            >
              {/* Day header */}
              <div className="flex border-b">
                <div className="w-48 shrink-0 py-2 text-xs font-semibold text-muted-foreground">Staff</div>
                <div className="flex">
                  {days.map((d) => (
                    <div
                      key={iso(d)}
                      style={{ width: CELL }}
                      title={isLeaveHoliday(d, holidays) ? "Public holiday" : isWeekend(d) ? "Weekend" : undefined}
                      className={`py-2 text-center text-[10px] leading-tight ${blockedDay(d) ? "bg-muted/80" : ""} ${
                        isSameDay(d, new Date()) ? "font-bold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <div>{format(d, "EEEEE")}</div>
                      <div>{format(d, "d")}</div>
                    </div>
                  ))}
                </div>
              </div>

              {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Loading calendar…</div>}
              {!isLoading && rows.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No staff leave to show for this month.</div>
              )}

              {rows.map((row) => (
                <div key={row.id} className="flex items-stretch border-b last:border-b-0">
                  <div className="w-48 shrink-0 py-2 pr-2">
                    <div className="truncate text-sm font-medium text-secondary">{row.name}</div>
                    {row.staffId && <div className="truncate text-xs text-muted-foreground">{row.staffId}</div>}
                  </div>
                  <div className="relative flex h-11">
                    {days.map((d, i) => (
                      <div
                        key={iso(d)}
                        style={{ width: CELL }}
                        onPointerDown={onCellDown(row.id, i)}
                        onPointerEnter={onCellEnter(row.id, i)}
                        className={`border-l ${i === days.length - 1 ? "border-r" : ""} ${
                          blockedDay(d) ? "bg-muted/80 cursor-not-allowed" : inSelection(row.id, i) ? "bg-primary/25" : "hover:bg-muted/60"
                        } ${canEditRow(row.id) && !blockedDay(d) ? "cursor-crosshair" : ""}`}
                        aria-label={`${row.name} ${format(d, "d MMM yyyy")}`}
                      />
                    ))}

                    {(byProfile[row.id] ?? []).map((r) => {
                      const g = barGeometry(r);
                      if (!g) return null;
                      return (
                        <button
                          type="button"
                          key={r.id}
                          onPointerDown={onBarDown(r)}
                          style={{ left: g.left + 2, width: Math.max(g.width, CELL - 4) }}
                          title={`${typeLabel(r.type)} · ${r.status} · ${g.start} → ${g.end}${r.reason ? ` · ${r.reason}` : ""}`}
                          className={`absolute top-1.5 flex h-8 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium shadow-sm ${barTone(
                            r.status
                          )} ${canMove(r) ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${g.shifted ? "ring-2 ring-primary" : ""}`}
                        >
                          <span className="truncate">{typeLabel(r.type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New leave request</DialogTitle>
            <DialogDescription>
              {rows.find((r) => r.id === formProfileId)?.name ?? "Staff"} ·{" "}
              {startDate && endDate ? `${format(new Date(`${startDate}T00:00:00`), "d MMM")} – ${format(new Date(`${endDate}T00:00:00`), "d MMM yyyy")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End date</Label>
                <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
            <Badge variant="secondary">Submitted requests stay pending until approved</Badge>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>
              {createRequest.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
