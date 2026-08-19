/**
 * PATROL PLAN MODULE — create, assign and close patrol plans.
 *
 * Plans are the forward-looking side of patrolling: an officer drafts the plan
 * (district, time window, vehicle, strength), command tier assigns it to a
 * patrol leader, it goes active, then it is closed with an outcome. Plans that
 * reserve a vehicle also surface on the Fleet Dashboard.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { CalendarClock, Plus, Loader2, Search, Trash2, CheckCircle2, Play, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/date-format";
import { orgUnitPath, type OrgUnit } from "@/lib/org-hierarchy";
import { useGhanaDistricts, useFleetVehicles } from "@/hooks/useFleet";
import { usePatrolStaffOptions } from "@/hooks/usePatrolLogs";
import {
import { DateInput } from "@/components/ui/date-input";
  usePatrolPlans, useCreatePatrolPlan, useUpdatePatrolPlan,
  useAssignPatrolPlan, useStartPatrolPlan, useClosePatrolPlan, useDeletePatrolPlan,
  isPlanOpen, PLAN_TYPES,
  type PatrolPlan, type PlanStatus,
} from "@/hooks/usePatrolPlans";

const label = (v: string) => v.replace(/_/g, " ");

const STATUS_CLASS: Record<string, string> = {
  draft: "border-muted bg-muted text-muted-foreground",
  assigned: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  active: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  completed: "border-primary/40 bg-primary/10 text-primary",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
};

function errMessage(e: unknown) {
  return (e as { message?: string })?.message || "Something went wrong";
}

const emptyForm = () => ({
  title: "",
  objective: "",
  planned_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "",
  district_id: "",
  org_unit_id: "",
  patrol_type: "routine",
  vehicle_id: "",
  assigned_to: "",
  personnel_count: 2,
  route_summary: "",
  status: "draft" as PlanStatus,
});

export default function PatrolPlanTab({
  units, canManage, homeUnitId,
}: { units: OrgUnit[]; canManage: boolean; homeUnitId?: string | null }) {
  const { data: plans = [], isLoading, error } = usePatrolPlans(90);
  const { data: districts = [] } = useGhanaDistricts();
  const { data: vehicles = [] } = useFleetVehicles();
  const { data: staff = [] } = usePatrolStaffOptions();

  const create = useCreatePatrolPlan();
  const update = useUpdatePatrolPlan();
  const assign = useAssignPatrolPlan();
  const start = useStartPatrolPlan();
  const close = useClosePatrolPlan();
  const remove = useDeletePatrolPlan();

  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatrolPlan | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [assigning, setAssigning] = useState<PatrolPlan | null>(null);
  const [assignee, setAssignee] = useState("");
  const [closing, setClosing] = useState<PatrolPlan | null>(null);
  const [closeStatus, setCloseStatus] = useState<"completed" | "cancelled">("completed");
  const [outcome, setOutcome] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id))),
    [units],
  );

  const vehicleLabel = (id: string | null) => {
    if (!id) return "—";
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.registration_number}${v.call_sign ? ` · ${v.call_sign}` : ""}` : "—";
  };

  const staffLabel = (id: string | null) => {
    if (!id) return "Unassigned";
    const s = staff.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}`.trim() || s.staff_id : "Unknown";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (openOnly && !isPlanOpen(p.status)) return false;
      if (!q) return true;
      return [p.plan_reference, p.title, p.district_name, p.patrol_type, p.route_summary, p.objective]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [plans, openOnly, search]);

  const openCount = plans.filter((p) => isPlanOpen(p.status)).length;
  const activeCount = plans.filter((p) => p.status === "active").length;

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm(), org_unit_id: homeUnitId ?? "" });
    setFormOpen(true);
  }

  function openEdit(p: PatrolPlan) {
    setEditing(p);
    setForm({
      title: p.title,
      objective: p.objective ?? "",
      planned_date: p.planned_date,
      start_time: (p.start_time ?? "").slice(0, 5),
      end_time: (p.end_time ?? "").slice(0, 5),
      district_id: p.district_id ?? "",
      org_unit_id: p.org_unit_id ?? "",
      patrol_type: p.patrol_type,
      vehicle_id: p.vehicle_id ?? "",
      assigned_to: p.assigned_to ?? "",
      personnel_count: p.personnel_count ?? 0,
      route_summary: p.route_summary ?? "",
      status: (p.status as PlanStatus) ?? "draft",
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Give the patrol plan a title");
      return;
    }
    if (!form.start_time) {
      toast.error("Planned start time is required");
      return;
    }
    const payload = {
      title: form.title.trim(),
      objective: form.objective || null,
      planned_date: form.planned_date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      district_id: form.district_id || null,
      org_unit_id: form.org_unit_id || null,
      patrol_type: form.patrol_type,
      vehicle_id: form.vehicle_id || null,
      assigned_to: form.assigned_to || null,
      personnel_count: Number(form.personnel_count) || 0,
      route_summary: form.route_summary || null,
      status: form.status,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success(`Plan ${editing.plan_reference} updated`);
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Plan ${created.plan_reference} created`);
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function doAssign() {
    if (!assigning || !assignee) {
      toast.error("Select the officer to assign");
      return;
    }
    try {
      await assign.mutateAsync({ id: assigning.id, assignedTo: assignee });
      toast.success(`Plan ${assigning.plan_reference} assigned`);
      setAssigning(null);
      setAssignee("");
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function doStart(p: PatrolPlan) {
    try {
      await start.mutateAsync(p.id);
      toast.success(`Plan ${p.plan_reference} is now active`);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function doClose() {
    if (!closing) return;
    try {
      await close.mutateAsync({
        id: closing.id, status: closeStatus, outcome, notes: closeNotes,
      });
      toast.success(`Plan ${closing.plan_reference} ${closeStatus}`);
      setClosing(null);
      setOutcome("");
      setCloseNotes("");
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function del(p: PatrolPlan) {
    try {
      await remove.mutateAsync(p.id);
      toast.success(`Plan ${p.plan_reference} deleted`);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
              Patrol plans
            </CardTitle>
            <CardDescription>
              {plans.length} plans · {openCount} open · {activeCount} under way (90 days, my command only).
              Plans that reserve a vehicle appear on the Fleet Dashboard.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            New plan
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={openOnly ? "default" : "outline"}
              onClick={() => setOpenOnly((v) => !v)}
            >
              {openOnly ? "Open plans" : "All statuses"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, title, district…"
                className="w-[260px] pl-8"
                aria-label="Search patrol plans"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">Could not load patrol plans: {errMessage(error)}</p>
          )}

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No patrol plans yet.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.plan_reference}</TableCell>
                    <TableCell>
                      <span className="font-medium">{p.title}</span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {label(p.patrol_type)} · {p.personnel_count} personnel
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(p.planned_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(p.start_time ?? "").slice(0, 5)}
                      {p.end_time ? ` – ${p.end_time.slice(0, 5)}` : ""}
                    </TableCell>
                    <TableCell>{p.district_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{vehicleLabel(p.vehicle_id)}</TableCell>
                    <TableCell className="text-xs">{staffLabel(p.assigned_to)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${STATUS_CLASS[p.status] ?? ""}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      {canManage && isPlanOpen(p.status) && p.status !== "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setAssigning(p); setAssignee(p.assigned_to ?? ""); }}
                        >
                          <UserCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                          Assign
                        </Button>
                      )}
                      {p.status === "assigned" && (
                        <Button size="sm" onClick={() => doStart(p)}>
                          <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                          Start
                        </Button>
                      )}
                      {isPlanOpen(p.status) && (
                        <Button
                          size="sm"
                          onClick={() => { setClosing(p); setCloseStatus("completed"); }}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          Close
                        </Button>
                      )}
                      {p.status === "draft" && (
                        <Button size="sm" variant="ghost" onClick={() => del(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          <span className="sr-only">Delete {p.plan_reference}</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Plan form ────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.plan_reference}` : "New patrol plan"}</DialogTitle>
            <DialogDescription>
              Plan the district, time window, vehicle and strength. Command tier assigns and closes plans.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-title">Plan title</Label>
              <Input
                id="plan-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Night sweep — Amasaman highway"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-date">Planned date</Label>
              <DateInput
                id="plan-date"
                value={form.planned_date}
                onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="plan-start">Start time</Label>
                <Input
                  id="plan-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-end">End time</Label>
                <Input
                  id="plan-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>District</Label>
              <Select
                value={form.district_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, district_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">Not specified</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} · {d.region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select
                value={form.org_unit_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, org_unit_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No unit</SelectItem>
                  {sortedUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{orgUnitPath(units, u.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Patrol type</Label>
              <Select
                value={form.patrol_type}
                onValueChange={(v) => setForm((f) => ({ ...f, patrol_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{label(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-strength">Personnel strength</Label>
              <Input
                id="plan-strength"
                type="number"
                min={0}
                value={form.personnel_count}
                onChange={(e) => setForm((f) => ({ ...f, personnel_count: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select
                value={form.vehicle_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">On foot / not applicable</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.registration_number}{v.call_sign ? ` · ${v.call_sign}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Patrol leader</Label>
              <StaffCombobox
                staff={staff}
                value={form.assigned_to}
                onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-objective">Objective</Label>
              <Textarea
                id="plan-objective"
                value={form.objective}
                onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                placeholder="What this patrol is meant to achieve"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-route">Route / checkpoints</Label>
              <Textarea
                id="plan-route"
                value={form.route_summary}
                onChange={(e) => setForm((f) => ({ ...f, route_summary: e.target.value }))}
                placeholder="Checkpoints in order"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as PlanStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save plan" : "Create plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign ───────────────────────────────────────────────────── */}
      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {assigning?.plan_reference}</DialogTitle>
            <DialogDescription>Pick the officer who will lead this patrol.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Patrol leader</Label>
            <StaffCombobox staff={staff} value={assignee} onValueChange={setAssignee} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>Cancel</Button>
            <Button onClick={doAssign} disabled={assign.isPending}>
              {assign.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              Assign plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close out ────────────────────────────────────────────────── */}
      <Dialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close {closing?.plan_reference}</DialogTitle>
            <DialogDescription>Record the outcome of the patrol plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Result</Label>
              <Select value={closeStatus} onValueChange={(v) => setCloseStatus(v as "completed" | "cancelled")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-outcome">Outcome</Label>
              <Input
                id="plan-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="Patrol executed, 2 checks conducted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-close-notes">Closure notes</Label>
              <Textarea
                id="plan-close-notes"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button>
            <Button onClick={doClose} disabled={close.isPending}>
              {close.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              Close plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
