import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, CalendarIcon, FileSpreadsheet, FileText, Download, ShieldCheck, Sparkles, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  exportScheduleXlsx, exportScheduleCsv, exportSchedulePdf, type Assignment,
} from "@/lib/guard-schedule-export";

const SHIFTS = ["A", "B", "C", "D"] as const;

// Defined time periods for each guard-duty shift. These are the canonical
// tour-of-duty windows used across the system (import, schedule, exports).
export const SHIFT_PERIODS: Record<"A" | "B" | "C" | "D", { label: string; start: string; end: string; tone: string }> = {
  A: { label: "Morning", start: "06:00", end: "14:00", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
  B: { label: "Afternoon", start: "14:00", end: "22:00", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40" },
  C: { label: "Night", start: "22:00", end: "06:00", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40" },
  D: { label: "Reserve", start: "—", end: "—", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
};

const SHIFT_LABEL: Record<string, string> = {
  A: `A · Morning ${SHIFT_PERIODS.A.start}–${SHIFT_PERIODS.A.end}`,
  B: `B · Afternoon ${SHIFT_PERIODS.B.start}–${SHIFT_PERIODS.B.end}`,
  C: `C · Night ${SHIFT_PERIODS.C.start}–${SHIFT_PERIODS.C.end}`,
  D: "D · Reserve",
};

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const a = new Date(start);
  const b = new Date(end);
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function GuardSchedule() {
  const { user, isAdminOrSupervisor, isIpse, loading } = useAuthContext();
  const canSchedule = isAdminOrSupervisor || isIpse;
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // List schedules
  const schedules = useQuery({
    queryKey: ["guard-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_schedules")
        .select("id, name, start_date, end_date, status, source_import_id, created_at, published_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && canSchedule,
  });

  // Latest committed roster (for auto-fill)
  const latestImport = useQuery({
    queryKey: ["latest-committed-roster"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("duty_roster_imports")
        .select("id, source_filename, effective_date, committed_at")
        .eq("status", "committed")
        .order("committed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && canSchedule,
  });

  // Active schedule + assignments
  const active = useQuery({
    queryKey: ["guard-schedule", activeId],
    queryFn: async () => {
      if (!activeId) return null;
      const [sched, assigns] = await Promise.all([
        supabase
          .from("guard_schedules")
          .select("id, name, start_date, end_date, status, source_import_id, notes")
          .eq("id", activeId)
          .maybeSingle(),
        supabase
          .from("guard_schedule_assignments")
          .select("id, duty_date, shift, profile_id, rank_text, name_text, serial_no, unit, position_label")
          .eq("schedule_id", activeId)
          .order("duty_date", { ascending: true })
          .order("shift", { ascending: true })
          .order("serial_no", { ascending: true }),
      ]);
      if (sched.error) throw sched.error;
      if (assigns.error) throw assigns.error;
      return { schedule: sched.data, assignments: (assigns.data ?? []) as Assignment[] };
    },
    enabled: !!activeId,
  });

  useEffect(() => {
    if (!activeId && schedules.data && schedules.data.length > 0) {
      setActiveId(schedules.data[0].id);
    }
  }, [schedules.data, activeId]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canSchedule) return <Navigate to="/dashboard" replace />;

  const scheduleHeader = active.data?.schedule
    ? {
        name: active.data.schedule.name,
        start_date: active.data.schedule.start_date,
        end_date: active.data.schedule.end_date,
        status: active.data.schedule.status,
      }
    : null;

  const days = scheduleHeader
    ? eachDate(scheduleHeader.start_date, scheduleHeader.end_date)
    : [];

  const byDayShift = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    (active.data?.assignments ?? []).forEach((a) => {
      const k = `${a.duty_date}|${a.shift}`;
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    });
    return map;
  }, [active.data]);

  // Resolve per-shift times for the active schedule. Falls back to canonical periods.
  const shiftTimes = useMemo<Record<"A"|"B"|"C"|"D", { start: string; end: string }>>(() => {
    const fallback = {
      A: { start: SHIFT_PERIODS.A.start, end: SHIFT_PERIODS.A.end },
      B: { start: SHIFT_PERIODS.B.start, end: SHIFT_PERIODS.B.end },
      C: { start: SHIFT_PERIODS.C.start, end: SHIFT_PERIODS.C.end },
      D: { start: "—", end: "—" },
    };
    const raw = active.data?.schedule?.notes;
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.shift_times) return { ...fallback, ...parsed.shift_times };
    } catch { /* notes is plain text — keep defaults */ }
    return fallback;
  }, [active.data]);

  const shiftLabelFor = (s: "A"|"B"|"C"|"D") => {
    const t = shiftTimes[s];
    const periodName = SHIFT_PERIODS[s].label;
    if (!t.start || t.start === "—") return `${s} · ${periodName}`;
    return `${s} · ${periodName} ${t.start}–${t.end}`;
  };

  const handlePublishToggle = async () => {
    if (!active.data?.schedule) return;
    const next = active.data.schedule.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("guard_schedules")
      .update({
        status: next,
        published_at: next === "published" ? new Date().toISOString() : null,
      })
      .eq("id", active.data.schedule.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Schedule published" : "Schedule reverted to draft");
    qc.invalidateQueries({ queryKey: ["guard-schedules"] });
    qc.invalidateQueries({ queryKey: ["guard-schedule", active.data.schedule.id] });
  };

  const handleDeleteSchedule = async () => {
    if (!active.data?.schedule) return;
    if (!confirm(`Delete schedule "${active.data.schedule.name}" and all assignments?`)) return;
    const { error } = await supabase.from("guard_schedules").delete().eq("id", active.data.schedule.id);
    if (error) return toast.error(error.message);
    setActiveId(null);
    qc.invalidateQueries({ queryKey: ["guard-schedules"] });
  };

  // (delete handled inside DayShiftCard)

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Guard Scheduling
          </h1>
          <p className="text-sm text-muted-foreground">
            Build, edit, and export shift schedules from the imported duty roster.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New schedule</Button>
          </DialogTrigger>
          <CreateScheduleDialog
            onCreated={(id) => { setActiveId(id); setCreateOpen(false); }}
            latestImportId={latestImport.data?.id ?? null}
            latestImportLabel={latestImport.data ? `${latestImport.data.source_filename} (${latestImport.data.effective_date})` : null}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Schedules</CardTitle>
          <CardDescription>Pick a schedule to edit or export.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (schedules.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No schedules yet — create one above.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(schedules.data ?? []).map((s: any) => (
                <Button
                  key={s.id}
                  variant={s.id === activeId ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveId(s.id)}
                  className="gap-2"
                >
                  {s.name}
                  <Badge variant={s.status === "published" ? "default" : "outline"} className="text-[10px]">
                    {s.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {s.start_date} → {s.end_date}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {active.data?.schedule && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{active.data.schedule.name}</CardTitle>
                <CardDescription>
                  {active.data.schedule.start_date} → {active.data.schedule.end_date} ·{" "}
                  {active.data.assignments.length} assignments
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => exportScheduleXlsx(scheduleHeader!, active.data!.assignments)}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportScheduleCsv(scheduleHeader!, active.data!.assignments)}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportSchedulePdf(scheduleHeader!, active.data!.assignments)}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
                <Button size="sm" onClick={handlePublishToggle}>
                  {active.data.schedule.status === "published" ? "Unpublish" : "Publish"}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleDeleteSchedule}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={days[0]} className="w-full">
              <div className="overflow-x-auto pb-2">
                <TabsList className="inline-flex flex-nowrap">
                  {days.slice(0, 31).map((d) => (
                    <TabsTrigger key={d} value={d} className="text-xs whitespace-nowrap">
                      {format(new Date(d), "EEE dd MMM")}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {days.slice(0, 31).map((d) => (
                <TabsContent key={d} value={d} className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SHIFTS.map((s) => (
                      <DayShiftCard
                        key={s}
                        scheduleId={activeId!}
                        date={d}
                        shift={s}
                        label={shiftLabelFor(s)}
                        items={byDayShift.get(`${d}|${s}`) ?? []}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- Create schedule dialog ---------- */
function CreateScheduleDialog({
  onCreated, latestImportId, latestImportLabel,
}: {
  onCreated: (id: string) => void;
  latestImportId: string | null;
  latestImportLabel: string | null;
}) {
  const { user } = useAuthContext();
  const [name, setName] = useState("");
  const [start, setStart] = useState<Date | undefined>(new Date());
  const [end, setEnd] = useState<Date | undefined>(() => { const d = new Date(); d.setDate(d.getDate() + 6); return d; });
  const [autoFill, setAutoFill] = useState(true);
  const [busy, setBusy] = useState(false);

  // Per-shift time allocations — defaults come from the canonical SHIFT_PERIODS.
  const [times, setTimes] = useState<Record<"A" | "B" | "C" | "D", { start: string; end: string }>>({
    A: { start: SHIFT_PERIODS.A.start, end: SHIFT_PERIODS.A.end },
    B: { start: SHIFT_PERIODS.B.start, end: SHIFT_PERIODS.B.end },
    C: { start: SHIFT_PERIODS.C.start, end: SHIFT_PERIODS.C.end },
    D: { start: "", end: "" },
  });

  const submit = async () => {
    if (!name.trim() || !start || !end) return toast.error("Name and date range required");
    if (end < start) return toast.error("End date must be on/after start date");
    setBusy(true);
    try {
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      // Persist time allocations inside `notes` as a tagged JSON block.
      const notesPayload = JSON.stringify({ shift_times: times });

      const { data: sched, error: e1 } = await supabase
        .from("guard_schedules")
        .insert({
          name: name.trim(),
          start_date: startStr,
          end_date: endStr,
          source_import_id: autoFill ? latestImportId : null,
          status: "draft",
          created_by: user!.id,
          notes: notesPayload,
        })
        .select("id")
        .single();
      if (e1 || !sched) throw e1 ?? new Error("Failed to create schedule");

      if (autoFill && latestImportId) {
        // Pull latest committed roster entries
        const { data: entries, error: e2 } = await supabase
          .from("duty_roster_entries")
          .select("shift, serial_no, rank, name, unit")
          .eq("import_id", latestImportId);
        if (e2) throw e2;

        // Resolve profile_ids by name (best-effort)
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name");
        const lookup = new Map<string, string>();
        (profiles ?? []).forEach((p: any) => {
          const k = `${(p.last_name || "").toUpperCase()} ${(p.first_name || "").toUpperCase()}`.trim();
          lookup.set(k, p.id);
        });
        const resolveProfile = (full: string) => {
          const parts = full.trim().toUpperCase().split(/\s+/);
          if (parts.length < 2) return null;
          const guess = `${parts[0]} ${parts[1]}`;
          return lookup.get(guess) ?? null;
        };

        // Generate one row per date for every roster entry
        const dates = eachDate(startStr, endStr);
        const inserts: any[] = [];
        for (const dt of dates) {
          for (const e of entries ?? []) {
            inserts.push({
              schedule_id: sched.id,
              duty_date: dt,
              shift: e.shift,
              profile_id: resolveProfile(e.name),
              rank_text: e.rank,
              name_text: e.name,
              serial_no: e.serial_no,
              unit: e.unit ?? null,
            });
          }
        }
        // Batched insert
        for (let i = 0; i < inserts.length; i += 200) {
          const slice = inserts.slice(i, i + 200);
          const { error: e3 } = await supabase.from("guard_schedule_assignments").insert(slice);
          if (e3) throw e3;
        }
        toast.success(`Created with ${inserts.length} auto-filled assignments`);
      } else {
        toast.success("Empty schedule created");
      }
      onCreated(sched.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New guard schedule</DialogTitle>
        <DialogDescription>Pick a date range and (optionally) auto-fill from the latest committed roster.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Schedule name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. May Week 1 Guard Schedule" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Start date" value={start} onChange={setStart} />
          <DateField label="End date" value={end} onChange={setEnd} />
        </div>

        {/* Per-shift time allocations */}
        <div className="rounded-lg border p-3 space-y-2 bg-muted/40">
          <div className="text-xs font-semibold flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5 text-primary" /> Shift time allocations
          </div>
          <p className="text-[11px] text-muted-foreground">
            Defaults match the canonical guard-duty periods. Adjust if this schedule needs custom hours
            (e.g. extended cover, exercise day).
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B", "C", "D"] as const).map((s) => (
              <div key={s} className="rounded-md border p-2 bg-background">
                <div className={cn("text-[11px] font-semibold mb-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border", SHIFT_PERIODS[s].tone)}>
                  Shift {s} · {SHIFT_PERIODS[s].label}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Input
                    type="time"
                    value={times[s].start}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [s]: { ...prev[s], start: e.target.value } }))}
                    className="h-7 text-xs"
                  />
                  <Input
                    type="time"
                    value={times[s].end}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [s]: { ...prev[s], end: e.target.value } }))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={autoFill && !!latestImportId} disabled={!latestImportId} onChange={(e) => setAutoFill(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Auto-fill from latest committed roster
            </span>
            <span className="block text-xs text-muted-foreground">
              {latestImportLabel ? `Source: ${latestImportLabel}` : "No committed roster found — import one first."}
            </span>
          </span>
        </label>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ---------- Add person popover ---------- */
function AddPersonPopover({ scheduleId, date, shift }: { scheduleId: string; date: string; shift: "A"|"B"|"C"|"D" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string>("");
  const [position, setPosition] = useState("");

  const profiles = useQuery({
    queryKey: ["sched-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, ranks(name)")
        .eq("status", "active")
        .order("last_name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const add = async () => {
    if (!profileId) return toast.error("Select a person");
    const p: any = (profiles.data ?? []).find((x: any) => x.id === profileId);
    if (!p) return;
    const { error } = await supabase.from("guard_schedule_assignments").insert({
      schedule_id: scheduleId,
      duty_date: date,
      shift,
      profile_id: p.id,
      rank_text: p.ranks?.name ?? null,
      name_text: `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim(),
      serial_no: null,
      position_label: position || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Added");
    setOpen(false); setProfileId(""); setPosition("");
    qc.invalidateQueries({ queryKey: ["guard-schedule", scheduleId] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7"><Plus className="h-3.5 w-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="end">
        <div>
          <Label className="text-xs">Person</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {(profiles.data ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.last_name} {p.first_name} <span className="text-xs text-muted-foreground ml-1">({p.staff_id})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Position (optional)</Label>
          <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Main gate" />
        </div>
        <Button size="sm" className="w-full" onClick={add}>Add to {shift}</Button>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Day-shift card with search, selection, edit, delete ---------- */
function DayShiftCard({
  scheduleId, date, shift, label, items,
}: {
  scheduleId: string;
  date: string;
  shift: "A" | "B" | "C" | "D";
  label: string;
  items: Assignment[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);

  // Reset selection when items change (e.g. after refetch)
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      const ids = new Set(items.map((i) => i.id));
      prev.forEach((id) => { if (ids.has(id)) next.add(id); });
      return next;
    });
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      [a.rank_text, a.name_text, a.position_label, a.serial_no?.toString(), a.unit]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((a) => next.delete(a.id));
      else filtered.forEach((a) => next.add(a.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const performDelete = async (ids: string[]) => {
    const { error } = await supabase.from("guard_schedule_assignments").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Removed ${ids.length} assignment${ids.length === 1 ? "" : "s"}`);
    setSelected(new Set());
    setConfirmDelete(null);
    qc.invalidateQueries({ queryKey: ["guard-schedule", scheduleId] });
  };

  return (
    <Card className="border">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{label}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{items.length} on duty</Badge>
            <AddPersonPopover scheduleId={scheduleId} date={date} shift={shift} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rank, name, position…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1"
              onClick={() => setConfirmDelete({
                ids: Array.from(selected),
                label: `${selected.size} selected assignment${selected.size === 1 ? "" : "s"}`,
              })}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border-t overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                    disabled={filtered.length === 0}
                  />
                </TableHead>
                <TableHead className="w-12 text-xs">S/N</TableHead>
                <TableHead className="text-xs">Rank</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Position</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">
                    {items.length === 0 ? "No personnel — click + to add" : "No matches"}
                  </TableCell>
                </TableRow>
              ) : filtered.map((a) => (
                <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={() => toggleOne(a.id)}
                      aria-label={`Select ${a.name_text}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.serial_no ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.rank_text}</TableCell>
                  <TableCell className="text-xs font-medium">{a.name_text}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.position_label ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(a)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setConfirmDelete({ ids: [a.id], label: a.name_text || "this assignment" })}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editing && (
        <EditAssignmentDialog
          scheduleId={scheduleId}
          assignment={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the assignment{(confirmDelete?.ids.length ?? 0) > 1 ? "s" : ""} from this schedule. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && performDelete(confirmDelete.ids)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ---------- Edit assignment dialog ---------- */
function EditAssignmentDialog({
  scheduleId, assignment, onClose,
}: {
  scheduleId: string;
  assignment: Assignment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rank, setRank] = useState(assignment.rank_text ?? "");
  const [name, setName] = useState(assignment.name_text ?? "");
  const [serial, setSerial] = useState<string>(assignment.serial_no?.toString() ?? "");
  const [position, setPosition] = useState(assignment.position_label ?? "");
  const [shift, setShift] = useState<"A"|"B"|"C"|"D">(assignment.shift as any);
  const [dutyDate, setDutyDate] = useState(assignment.duty_date);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    const serialNum = serial.trim() ? Number(serial) : null;
    if (serial.trim() && Number.isNaN(serialNum)) {
      setBusy(false);
      return toast.error("S/N must be a number");
    }
    const { error } = await supabase
      .from("guard_schedule_assignments")
      .update({
        rank_text: rank.trim() || null,
        name_text: name.trim(),
        serial_no: serialNum,
        position_label: position.trim() || null,
        shift,
        duty_date: dutyDate,
      })
      .eq("id", assignment.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Assignment updated");
    qc.invalidateQueries({ queryKey: ["guard-schedule", scheduleId] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>Update details for this shift assignment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={dutyDate} onChange={(e) => setDutyDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["A","B","C","D"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{s} · {SHIFT_PERIODS[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">S/N</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Rank</Label>
              <Input value={rank} onChange={(e) => setRank(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Position</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Main gate" className="h-8 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
