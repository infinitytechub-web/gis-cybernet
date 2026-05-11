import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  Layers,
  Plus,
  Save,
  Trash2,
  Send,
  Archive,
  History,
  AlertTriangle,
  RotateCcw,
  Pencil,
  ListPlus,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/PageHeader";

/* ────────────────────────────── Types ────────────────────────────── */

type RotationStatus = "draft" | "published" | "archived";
type ScopeType = "org" | "department" | "role" | "staff";

interface RotationSchedule {
  id: string;
  name: string;
  description: string | null;
  anchor_date: string;
  pattern: string[];
  cycle_length: number;
  timezone: string;
  status: RotationStatus;
  version: number;
  parent_schedule_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RotationAssignment {
  id: string;
  schedule_id: string;
  scope_type: ScopeType;
  scope_value: string | null;
  start_date: string;
  end_date: string | null;
  priority: number;
  notes: string | null;
}

const STATUS_TONE: Record<RotationStatus, string> = {
  draft: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  archived: "bg-muted text-muted-foreground border-muted-foreground/30",
};

/* ───────────────────────── Pattern helpers ───────────────────────── */

function parsePattern(input: string): string[] | null {
  const parts = input
    .split(/[,\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 12) return null;
  for (const p of parts) if (!/^[A-Z]$/.test(p)) return null;
  return parts;
}

/* ───────────────────────────── Page ───────────────────────────── */

export default function AdminShiftRotations() {
  const qc = useQueryClient();
  const { isAdminOrSupervisor } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["rotation-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rotation_schedules" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RotationSchedule[];
    },
    enabled: isAdminOrSupervisor,
  });

  // Realtime invalidation
  useEffect(() => {
    if (!isAdminOrSupervisor) return;
    const ch = supabase
      .channel("admin-rotations")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_schedules" }, () => {
        qc.invalidateQueries({ queryKey: ["rotation-schedules"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_assignments" }, () => {
        qc.invalidateQueries({ queryKey: ["rotation-assignments"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, isAdminOrSupervisor]);

  const schedules = schedulesQuery.data ?? [];
  const selected = schedules.find((s) => s.id === selectedId) ?? null;

  if (!isAdminOrSupervisor) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader
          title="Shift Rotations"
          subtitle="Restricted to command-tier personnel."
          icon={Layers}
        />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You do not have permission to manage rotation schedules.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Flexible Shift Rotations"
        subtitle="Build, version, and deploy organisation-wide rotation schedules."
        icon={Layers}
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Schedule list */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Schedules</CardTitle>
              <CardDescription>{schedules.length} total</CardDescription>
            </div>
            <Button size="sm" onClick={() => setSelectedId("__new__")} className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {schedulesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No schedules yet. Click "New" to create one.
              </p>
            ) : (
              schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left rounded-md border p-2.5 transition-colors hover:bg-accent ${
                    selectedId === s.id ? "border-primary bg-accent/50" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{s.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[s.status]}`}>
                      {s.status} · v{s.version}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                    {s.pattern.join(" → ")} · cycle {s.cycle_length}d
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <div>
          {selectedId === "__new__" ? (
            <ScheduleEditor
              key="new"
              schedule={null}
              onSaved={(id) => setSelectedId(id)}
              onCancel={() => setSelectedId(null)}
            />
          ) : selected ? (
            <ScheduleEditor
              key={selected.id}
              schedule={selected}
              onSaved={(id) => setSelectedId(id)}
              onCancel={() => setSelectedId(null)}
            />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Select a schedule on the left, or click <strong>New</strong> to create one.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Schedule Editor ─────────────────────── */

interface EditorProps {
  schedule: RotationSchedule | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

function ScheduleEditor({ schedule, onSaved, onCancel }: EditorProps) {
  const qc = useQueryClient();
  const isNew = !schedule;
  const isPublished = schedule?.status === "published";

  const [name, setName] = useState(schedule?.name ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [anchor, setAnchor] = useState(schedule?.anchor_date ?? format(new Date(), "yyyy-MM-dd"));
  const [patternText, setPatternText] = useState(schedule?.pattern.join(",") ?? "A,B,C,D");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "Africa/Accra");
  const [confirmPublish, setConfirmPublish] = useState(false);

  const pattern = useMemo(() => parsePattern(patternText), [patternText]);

  const preview = useMemo(() => {
    if (!pattern) return [];
    let start: Date;
    try {
      start = parseISO(anchor);
      if (Number.isNaN(start.getTime())) return [];
    } catch {
      return [];
    }
    return Array.from({ length: 28 }).map((_, i) => {
      const d = addDays(start, i);
      const idx = ((i % pattern.length) + pattern.length) % pattern.length;
      return { date: d, group: pattern[idx] };
    });
  }, [anchor, pattern]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!pattern) throw new Error("Pattern must be 1–12 single uppercase letters.");
      if (!name.trim()) throw new Error("Name is required.");

      if (isNew) {
        const { data, error } = await supabase
          .from("shift_rotation_schedules" as any)
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            anchor_date: anchor,
            pattern,
            timezone,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("shift_rotation_deploy_audit" as any).insert({
          schedule_id: (data as any).id,
          action: "created",
          diff: { name, anchor_date: anchor, pattern, timezone } as any,
        } as any);
        return (data as any).id as string;
      } else {
        const { error } = await supabase
          .from("shift_rotation_schedules" as any)
          .update({
            name: name.trim(),
            description: description.trim() || null,
            anchor_date: anchor,
            pattern,
            timezone,
          } as any)
          .eq("id", schedule!.id);
        if (error) throw error;
        await supabase.from("shift_rotation_deploy_audit" as any).insert({
          schedule_id: schedule!.id,
          action: "edited",
          diff: { name, anchor_date: anchor, pattern, timezone } as any,
        } as any);
        return schedule!.id;
      }
    },
    onSuccess: (id) => {
      toast.success(isNew ? "Schedule created" : "Schedule saved");
      qc.invalidateQueries({ queryKey: ["rotation-schedules"] });
      onSaved(id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) throw new Error("Save the draft first.");
      const { error } = await supabase
        .from("shift_rotation_schedules" as any)
        .update({ status: "published" } as any)
        .eq("id", schedule.id);
      if (error) throw error;
      await supabase.from("shift_rotation_deploy_audit" as any).insert({
        schedule_id: schedule.id,
        action: "published",
        diff: { name: schedule.name, version: schedule.version } as any,
      } as any);
    },
    onSuccess: () => {
      toast.success("Schedule published organisation-wide");
      qc.invalidateQueries({ queryKey: ["rotation-schedules"] });
      setConfirmPublish(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed"),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) return;
      const { error } = await supabase
        .from("shift_rotation_schedules" as any)
        .update({ status: "archived" } as any)
        .eq("id", schedule.id);
      if (error) throw error;
      await supabase.from("shift_rotation_deploy_audit" as any).insert({
        schedule_id: schedule.id,
        action: "archived",
        diff: {} as any,
      } as any);
    },
    onSuccess: () => {
      toast.success("Schedule archived");
      qc.invalidateQueries({ queryKey: ["rotation-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Archive failed"),
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) return null;
      const { data, error } = await supabase
        .from("shift_rotation_schedules" as any)
        .insert({
          name: schedule.name,
          description: schedule.description,
          anchor_date: schedule.anchor_date,
          pattern: schedule.pattern,
          timezone: schedule.timezone,
          parent_schedule_id: schedule.id,
          version: schedule.version + 1,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("shift_rotation_deploy_audit" as any).insert({
        schedule_id: (data as any).id,
        action: "cloned",
        diff: { from: schedule.id, version: schedule.version + 1 } as any,
      } as any);
      return (data as any).id as string;
    },
    onSuccess: (id) => {
      if (id) {
        toast.success("Cloned to a new draft");
        qc.invalidateQueries({ queryKey: ["rotation-schedules"] });
        onSaved(id);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Clone failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {isNew ? (
                  <>
                    <Plus className="h-4 w-4 text-primary" /> New schedule
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4 text-primary" /> Edit · {schedule?.name}
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {isPublished
                  ? "This schedule is published. Editing core fields is locked — clone it to create a new version."
                  : "Configure the rotation, then save and publish to deploy."}
              </CardDescription>
            </div>
            {schedule && (
              <Badge variant="outline" className={STATUS_TONE[schedule.status]}>
                {schedule.status} · v{schedule.version}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rot-name">Name</Label>
              <Input
                id="rot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPublished}
                placeholder="e.g. Operations 4-Day Rotation"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-tz">Timezone</Label>
              <Input
                id="rot-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={isPublished}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rot-desc">Description</Label>
            <Textarea
              id="rot-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes for other admins."
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rot-anchor" className="flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> Anchor date
              </Label>
              <Input
                id="rot-anchor"
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                disabled={isPublished}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-pattern" className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" /> Pattern
              </Label>
              <Input
                id="rot-pattern"
                value={patternText}
                onChange={(e) => setPatternText(e.target.value)}
                disabled={isPublished}
                placeholder="A,B,C,D"
                className="font-mono uppercase"
              />
              {!pattern ? (
                <p className="text-xs text-destructive">
                  Pattern must be 1–12 single uppercase letters.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {pattern.length} groups · cycles every {pattern.length} day{pattern.length === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* 28-day preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">28-day preview from anchor</Label>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {preview.map((p) => (
                <div
                  key={p.date.toISOString()}
                  className="rounded-md border bg-card p-1.5 flex flex-col items-center gap-0.5"
                >
                  <span className="text-[10px] text-muted-foreground">{format(p.date, "EEE")}</span>
                  <span className="font-semibold tabular-nums">{format(p.date, "d MMM")}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {p.group}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Close
            </Button>
            {schedule && (
              <Button variant="outline" size="sm" onClick={() => cloneMutation.mutate()} className="gap-1.5">
                <RotateCcw className="h-4 w-4" /> Clone as new version
              </Button>
            )}
            {schedule && schedule.status !== "archived" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => archiveMutation.mutate()}
                className="gap-1.5"
              >
                <Archive className="h-4 w-4" /> Archive
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !pattern || isPublished}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : isNew ? "Create draft" : "Save"}
            </Button>
            {schedule && schedule.status === "draft" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setConfirmPublish(true)}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" /> Publish
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {schedule && (
        <>
          <AssignmentsPanel scheduleId={schedule.id} disabled={false} />
          <AuditPanel scheduleId={schedule.id} />
        </>
      )}

      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Once published, the anchor date, pattern and timezone are locked. Staff will see the new
              rotation in My Shift Tracker. Clone the schedule to create future versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? "Publishing…" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────────────── Assignments Panel ───────────────────── */

function AssignmentsPanel({ scheduleId, disabled }: { scheduleId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const [scopeType, setScopeType] = useState<ScopeType>("org");
  const [scopeValue, setScopeValue] = useState("");
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState("");
  const [priority, setPriority] = useState<number>(0);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [policy, setPolicy] = useState<
    "cancel" | "override_priority" | "replace" | "command_tier_exception"
  >("override_priority");
  const [policyNotes, setPolicyNotes] = useState("");

  const assignmentsQuery = useQuery({
    queryKey: ["rotation-assignments", scheduleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rotation_assignments" as any)
        .select("*")
        .eq("schedule_id", scheduleId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RotationAssignment[];
    },
  });

  const checkConflicts = async (): Promise<any[]> => {
    const { data, error } = await supabase.rpc("detect_rotation_conflicts" as any, {
      _scope_type: scopeType,
      _scope_value: scopeType === "org" ? null : scopeValue || null,
      _start_date: start,
      _end_date: end || null,
      _exclude_assignment_id: null,
    } as any);
    if (error) {
      toast.error(error.message);
      return [];
    }
    const list = ((data as any[]) ?? []);
    setConflicts(list);
    return list;
  };

  /** Insert the assignment using the chosen override policy. */
  const resolveAndAddMutation = useMutation({
    mutationFn: async () => {
      if (policy === "cancel") return;

      let insertPriority = priority;
      const auditDiff: Record<string, unknown> = {
        scope_type: scopeType,
        scope_value: scopeType === "org" ? null : scopeValue.trim() || null,
        start_date: start,
        end_date: end || null,
        policy,
        notes: policyNotes || null,
        conflict_ids: conflicts.map((c) => c.assignment_id),
      };

      if (policy === "replace") {
        // Delete each conflicting assignment first; resolver then sees only ours.
        const ids = conflicts.map((c) => c.assignment_id).filter(Boolean);
        if (ids.length) {
          const { error: delErr } = await supabase
            .from("shift_rotation_assignments" as any)
            .delete()
            .in("id", ids);
          if (delErr) throw delErr;
        }
      } else if (policy === "override_priority") {
        // Bump above the highest existing priority among conflicts.
        const { data: peers, error: peerErr } = await supabase
          .from("shift_rotation_assignments" as any)
          .select("priority")
          .in("id", conflicts.map((c) => c.assignment_id));
        if (peerErr) throw peerErr;
        const maxP = Math.max(0, ...((peers as any[]) ?? []).map((p) => Number(p.priority) || 0));
        insertPriority = Math.max(priority, maxP + 1);
        auditDiff.resolved_priority = insertPriority;
      } else if (policy === "command_tier_exception") {
        // Ensure command-tier roles are excluded from org-wide assignments so this
        // deployment doesn't sweep them in alongside the conflicting one.
        const commandRoles = ["admin", "oic", "2ic", "staff_officer", "supervisor"];
        const { error: excErr } = await supabase
          .from("shift_rotation_exclusions" as any)
          .upsert(
            commandRoles.map((r) => ({
              role: r,
              reason: `Auto-added via conflict resolution on schedule ${scheduleId}`,
            })),
            { onConflict: "role", ignoreDuplicates: true } as any,
          );
        if (excErr) throw excErr;
        // Still bump priority so this row wins where it does apply.
        insertPriority = Math.max(priority, 1);
        auditDiff.command_tier_excluded_roles = commandRoles;
        auditDiff.resolved_priority = insertPriority;
      }

      const { error } = await supabase.from("shift_rotation_assignments" as any).insert({
        schedule_id: scheduleId,
        scope_type: scopeType,
        scope_value: scopeType === "org" ? null : scopeValue.trim() || null,
        start_date: start,
        end_date: end || null,
        priority: insertPriority,
        notes: policyNotes || null,
      } as any);
      if (error) throw error;

      // Audit the resolution.
      await supabase.from("shift_rotation_deploy_audit" as any).insert({
        schedule_id: scheduleId,
        action: `assignment_added_${policy}`,
        diff: auditDiff as any,
        notes: policyNotes || null,
      } as any);
    },
    onSuccess: () => {
      if (policy === "cancel") {
        toast.message("Insertion cancelled");
      } else {
        toast.success("Assignment added — conflict resolved");
      }
      setScopeValue("");
      setEnd("");
      setPriority(0);
      setPolicyNotes("");
      setConflicts([]);
      setResolveOpen(false);
      qc.invalidateQueries({ queryKey: ["rotation-assignments", scheduleId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Resolution failed"),
  });

  /** Direct-add path used when there are no conflicts. */
  const addMutation = useMutation({
    mutationFn: async () => {
      const list = await checkConflicts();
      if (list.length > 0) {
        // Defer to the resolution dialog; do not insert yet.
        setResolveOpen(true);
        throw new Error("__deferred__");
      }
      const { error } = await supabase.from("shift_rotation_assignments" as any).insert({
        schedule_id: scheduleId,
        scope_type: scopeType,
        scope_value: scopeType === "org" ? null : scopeValue.trim() || null,
        start_date: start,
        end_date: end || null,
        priority,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment added");
      setScopeValue("");
      setEnd("");
      setPriority(0);
      setConflicts([]);
      qc.invalidateQueries({ queryKey: ["rotation-assignments", scheduleId] });
    },
    onError: (e: any) => {
      if (e?.message === "__deferred__") return; // dialog opened
      toast.error(e?.message ?? "Add failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("shift_rotation_assignments" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      qc.invalidateQueries({ queryKey: ["rotation-assignments", scheduleId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Remove failed"),
  });

  const rows = assignmentsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" /> Date-range assignments
        </CardTitle>
        <CardDescription>
          Apply this rotation to the whole organisation, a department, a role, or a specific staff
          member. Staff-scoped assignments override role/department, which override organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-6 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Scope</Label>
            <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org">Organisation</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="staff">Staff (profile id)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Value {scopeType === "org" ? "(none)" : ""}</Label>
            <Input
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              disabled={scopeType === "org"}
              placeholder={
                scopeType === "department"
                  ? "Department id"
                  : scopeType === "role"
                  ? "e.g. supervisor"
                  : scopeType === "staff"
                  ? "Profile UUID"
                  : ""
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End (optional)</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Input
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkConflicts()}
              disabled={disabled}
              className="flex-1"
            >
              Check
            </Button>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={disabled || addMutation.isPending}
              className="flex-1 gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <BulkAssignmentsPanel scheduleId={scheduleId} disabled={disabled} />

        {conflicts.length > 0 && !resolveOpen && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> {conflicts.length} overlapping published assignment(s)
              </div>
              <Button size="sm" variant="outline" onClick={() => setResolveOpen(true)}>
                Resolve…
              </Button>
            </div>
            <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
              {conflicts.map((c: any) => (
                <li key={c.assignment_id}>
                  • {c.schedule_name} — {c.start_date} → {c.end_date ?? "open"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No assignments yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="outline">{r.scope_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.scope_value ?? "—"}</TableCell>
                    <TableCell>{r.start_date}</TableCell>
                    <TableCell>{r.end_date ?? <span className="text-muted-foreground">open</span>}</TableCell>
                    <TableCell className="tabular-nums">{r.priority}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteMutation.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* ───────────── Resolution dialog ───────────── */}
      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Resolve {conflicts.length} conflict(s)
            </AlertDialogTitle>
            <AlertDialogDescription>
              The new assignment overlaps with existing published assignments for this scope.
              Choose how the resolver should handle the overlap.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-0.5 max-h-32 overflow-y-auto">
              {conflicts.map((c: any) => (
                <div key={c.assignment_id} className="font-mono">
                  {c.schedule_name} · {c.start_date} → {c.end_date ?? "open"}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Override policy</Label>
              {[
                {
                  v: "override_priority",
                  t: "Override with higher priority",
                  d: "Insert this assignment with priority bumped above all conflicts. Resolver picks the most-specific, then highest-priority assignment per day.",
                },
                {
                  v: "replace",
                  t: "Replace conflicting assignments",
                  d: "Delete the overlapping assignments, then insert this one. Use when this rotation supersedes the previous one.",
                },
                {
                  v: "command_tier_exception",
                  t: "Apply command-tier exception",
                  d: "Insert with bumped priority and ensure command-tier roles (admin, OIC, 2IC, Staff Officer, Supervisor) are excluded from org-wide rotations.",
                },
                {
                  v: "cancel",
                  t: "Cancel",
                  d: "Don't insert anything. Adjust the date range or scope and try again.",
                },
              ].map((opt) => (
                <label
                  key={opt.v}
                  className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                    policy === opt.v ? "border-primary bg-accent/40" : "hover:bg-accent/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="policy"
                    className="mt-0.5"
                    checked={policy === opt.v}
                    onChange={() => setPolicy(opt.v as typeof policy)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{opt.t}</div>
                    <div className="text-xs text-muted-foreground">{opt.d}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <Label htmlFor="policy-notes" className="text-xs">Audit note (optional)</Label>
              <Textarea
                id="policy-notes"
                rows={2}
                value={policyNotes}
                onChange={(e) => setPolicyNotes(e.target.value)}
                placeholder="Why are you applying this override?"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResolveOpen(false)}>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resolveAndAddMutation.mutate()}
              disabled={resolveAndAddMutation.isPending}
            >
              {resolveAndAddMutation.isPending ? "Applying…" : "Apply policy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ───────────────────────── Audit Panel ───────────────────────── */

function AuditPanel({ scheduleId }: { scheduleId: string }) {
  const auditQuery = useQuery({
    queryKey: ["rotation-audit", scheduleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rotation_deploy_audit" as any)
        .select("*")
        .eq("schedule_id", scheduleId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = auditQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> Recent activity
        </CardTitle>
        <CardDescription>Most recent 20 audit events for this schedule.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-2 border-b border-border/50 pb-1.5 last:border-0">
                <Badge variant="outline" className="text-[10px]">{r.action}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {format(parseISO(r.created_at), "dd MMM yyyy HH:mm")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Bulk Assignments Panel ───────────────────── */

type StagedRow = {
  key: string;
  scope_type: ScopeType;
  scope_value: string;
  start_date: string;
  end_date: string;
  priority: number;
  conflicts?: any[];
  conflictsChecked?: boolean;
};

type BulkPolicy = "override_priority" | "replace" | "command_tier_exception" | "skip_conflicting";

const BULK_POLICY_OPTIONS: { v: BulkPolicy; t: string; d: string }[] = [
  {
    v: "override_priority",
    t: "Override with higher priority",
    d: "Insert each row with priority bumped above its conflicts. Resolver picks the most-specific, then highest-priority assignment.",
  },
  {
    v: "replace",
    t: "Replace conflicting assignments",
    d: "Delete every overlapping assignment first, then insert the staged rows.",
  },
  {
    v: "command_tier_exception",
    t: "Apply command-tier exception",
    d: "Insert with bumped priority and ensure command-tier roles are excluded from org-wide rotations.",
  },
  {
    v: "skip_conflicting",
    t: "Skip rows with conflicts",
    d: "Insert only the staged rows that have zero conflicts. Conflicting rows stay in the staging list for review.",
  },
];

function newStagedRow(): StagedRow {
  return {
    key: crypto.randomUUID(),
    scope_type: "org",
    scope_value: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: "",
    priority: 0,
  };
}

function BulkAssignmentsPanel({ scheduleId, disabled }: { scheduleId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const [staged, setStaged] = useState<StagedRow[]>([]);
  const [policy, setPolicy] = useState<BulkPolicy>("override_priority");
  const [policyNotes, setPolicyNotes] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const totalConflicts = useMemo(
    () => staged.reduce((acc, r) => acc + (r.conflicts?.length ?? 0), 0),
    [staged],
  );
  const checkedAll = staged.length > 0 && staged.every((r) => r.conflictsChecked);
  const conflictingRows = staged.filter((r) => (r.conflicts?.length ?? 0) > 0).length;

  function patch(key: string, updates: Partial<StagedRow>) {
    setStaged((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...updates, conflictsChecked: false, conflicts: undefined } : r)),
    );
  }

  async function checkAllConflicts() {
    setRunning(true);
    try {
      const next: StagedRow[] = [];
      for (const r of staged) {
        const { data, error } = await supabase.rpc("detect_rotation_conflicts" as any, {
          _scope_type: r.scope_type,
          _scope_value: r.scope_type === "org" ? null : r.scope_value || null,
          _start_date: r.start_date,
          _end_date: r.end_date || null,
          _exclude_assignment_id: null,
        } as any);
        if (error) {
          toast.error(`Conflict check failed: ${error.message}`);
          next.push({ ...r, conflicts: [], conflictsChecked: true });
          continue;
        }
        next.push({ ...r, conflicts: (data as any[]) ?? [], conflictsChecked: true });
      }
      setStaged(next);
      const total = next.reduce((acc, r) => acc + (r.conflicts?.length ?? 0), 0);
      toast.success(total === 0 ? "No conflicts in any staged row." : `${total} conflict(s) across ${next.filter((r) => (r.conflicts?.length ?? 0) > 0).length} row(s).`);
    } finally {
      setRunning(false);
    }
  }

  /** Apply the selected policy across every staged row in one transaction-ish loop. */
  async function applyBulk() {
    setRunning(true);
    let succeeded = 0;
    let skipped = 0;
    const auditDiffs: Record<string, unknown>[] = [];

    try {
      // Pre-step: command-tier exclusions (only needed once).
      if (policy === "command_tier_exception") {
        const commandRoles = ["admin", "oic", "2ic", "staff_officer", "supervisor"];
        const { error: excErr } = await supabase
          .from("shift_rotation_exclusions" as any)
          .upsert(
            commandRoles.map((r) => ({
              role: r,
              reason: `Auto-added via bulk conflict resolution on schedule ${scheduleId}`,
            })),
            { onConflict: "role", ignoreDuplicates: true } as any,
          );
        if (excErr) throw excErr;
      }

      for (const r of staged) {
        const conflictIds = (r.conflicts ?? []).map((c: any) => c.assignment_id).filter(Boolean);
        const hasConflict = conflictIds.length > 0;

        if (policy === "skip_conflicting" && hasConflict) {
          skipped += 1;
          continue;
        }

        let insertPriority = r.priority;

        if (hasConflict && policy === "replace") {
          const { error: delErr } = await supabase
            .from("shift_rotation_assignments" as any)
            .delete()
            .in("id", conflictIds);
          if (delErr) throw delErr;
        } else if (hasConflict && (policy === "override_priority" || policy === "command_tier_exception")) {
          const { data: peers, error: peerErr } = await supabase
            .from("shift_rotation_assignments" as any)
            .select("priority")
            .in("id", conflictIds);
          if (peerErr) throw peerErr;
          const maxP = Math.max(0, ...((peers as any[]) ?? []).map((p) => Number(p.priority) || 0));
          insertPriority = Math.max(r.priority, maxP + 1);
        }

        const { error } = await supabase.from("shift_rotation_assignments" as any).insert({
          schedule_id: scheduleId,
          scope_type: r.scope_type,
          scope_value: r.scope_type === "org" ? null : r.scope_value.trim() || null,
          start_date: r.start_date,
          end_date: r.end_date || null,
          priority: insertPriority,
          notes: policyNotes || null,
        } as any);
        if (error) throw error;

        succeeded += 1;
        auditDiffs.push({
          scope_type: r.scope_type,
          scope_value: r.scope_type === "org" ? null : r.scope_value.trim() || null,
          start_date: r.start_date,
          end_date: r.end_date || null,
          conflict_ids: conflictIds,
          resolved_priority: insertPriority,
        });
      }

      // Single audit row covering the whole batch.
      await supabase.from("shift_rotation_deploy_audit" as any).insert({
        schedule_id: scheduleId,
        action: `bulk_assignment_${policy}`,
        diff: { policy, total: staged.length, succeeded, skipped, rows: auditDiffs } as any,
        notes: policyNotes || null,
      } as any);

      toast.success(`Bulk applied: ${succeeded} inserted${skipped ? `, ${skipped} skipped` : ""}.`);
      setStaged((prev) => (policy === "skip_conflicting" ? prev.filter((r) => (r.conflicts?.length ?? 0) > 0) : []));
      setPolicyNotes("");
      setBulkOpen(false);
      qc.invalidateQueries({ queryKey: ["rotation-assignments", scheduleId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk apply failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <ListPlus className="h-4 w-4 text-primary" /> Bulk add ranges
          </div>
          <p className="text-xs text-muted-foreground">
            Stage multiple scope/date ranges, check conflicts in one pass, then apply a single override policy.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStaged((p) => [...p, newStagedRow()])}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add row
        </Button>
      </div>

      {staged.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No rows staged. Click "Add row" to stage one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Conflicts</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staged.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Select
                      value={r.scope_type}
                      onValueChange={(v) => patch(r.key, { scope_type: v as ScopeType, scope_value: v === "org" ? "" : r.scope_value })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org">Organisation</SelectItem>
                        <SelectItem value="department">Department</SelectItem>
                        <SelectItem value="role">Role</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-xs"
                      value={r.scope_value}
                      disabled={r.scope_type === "org"}
                      onChange={(e) => patch(r.key, { scope_value: e.target.value })}
                      placeholder={r.scope_type === "org" ? "—" : r.scope_type}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={r.start_date}
                      onChange={(e) => patch(r.key, { start_date: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={r.end_date}
                      onChange={(e) => patch(r.key, { end_date: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-xs w-16"
                      value={r.priority}
                      onChange={(e) => patch(r.key, { priority: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    {!r.conflictsChecked ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (r.conflicts?.length ?? 0) === 0 ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40">
                        clear
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/40">
                        {r.conflicts!.length}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setStaged((prev) => prev.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {staged.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {checkedAll
              ? `${conflictingRows} of ${staged.length} row(s) have conflicts (${totalConflicts} total).`
              : "Conflicts not yet checked for all rows."}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={checkAllConflicts} disabled={disabled || running}>
              {running ? "Checking…" : "Check all"}
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={disabled || running || !checkedAll}
              className="gap-1.5"
            >
              <ListPlus className="h-4 w-4" /> Resolve & commit all
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Bulk-resolve {staged.length} staged row(s)
            </AlertDialogTitle>
            <AlertDialogDescription>
              {totalConflicts > 0
                ? `${totalConflicts} overlapping published assignment(s) detected across ${conflictingRows} row(s). The chosen policy will be applied to every staged row.`
                : "No conflicts detected — staged rows will be inserted as-is."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <Label className="text-xs">Override policy</Label>
              {BULK_POLICY_OPTIONS.map((opt) => (
                <label
                  key={opt.v}
                  className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                    policy === opt.v ? "border-primary bg-accent/40" : "hover:bg-accent/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="bulk-policy"
                    className="mt-0.5"
                    checked={policy === opt.v}
                    onChange={() => setPolicy(opt.v)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{opt.t}</div>
                    <div className="text-xs text-muted-foreground">{opt.d}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <Label htmlFor="bulk-policy-notes" className="text-xs">Audit note (optional)</Label>
              <Textarea
                id="bulk-policy-notes"
                rows={2}
                value={policyNotes}
                onChange={(e) => setPolicyNotes(e.target.value)}
                placeholder="Why are you applying this override across all rows?"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkOpen(false)}>Close</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulk} disabled={running}>
              {running ? "Applying…" : "Apply to all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
