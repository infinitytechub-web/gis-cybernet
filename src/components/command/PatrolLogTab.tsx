/**
 * PATROL LOG MODULE — date, time, district, incidents and photos.
 *
 * Entries are captured against an org unit, so the same records surface on the
 * Unit Dashboard (patrol count, 30-day incidents and the patrol table). Row
 * visibility is enforced by RLS: staff see their own unit branch, command-tier
 * officers see their whole branch and may review or close an entry.
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
import { Footprints, Plus, Loader2, Search, Images, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/date-format";
import { orgUnitPath, type OrgUnit } from "@/lib/org-hierarchy";
import { useGhanaDistricts, useFleetVehicles } from "@/hooks/useFleet";
import { DateInput } from "@/components/ui/date-input";
import {
  usePatrolLogs, usePatrolPhotos, usePatrolStaffOptions,
  useCreatePatrolLog, useUpdatePatrolLog, useReviewPatrolLog,
  useDeletePatrolLog, useDeletePatrolPhoto,
  isPatrolOpen, validatePatrolPhoto,
  PATROL_TYPES, PATROL_STATUSES,
  type PatrolLog, type PatrolStatus,
} from "@/hooks/usePatrolLogs";

const label = (v: string) => v.replace(/_/g, " ");

const STATUS_CLASS: Record<string, string> = {
  draft: "border-muted bg-muted text-muted-foreground",
  submitted: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  reviewed: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  closed: "border-primary/40 bg-primary/10 text-primary",
};

function errMessage(e: unknown) {
  return (e as { message?: string })?.message || "Something went wrong";
}

const emptyForm = () => ({
  patrol_date: new Date().toISOString().slice(0, 10),
  start_time: "08:00",
  end_time: "",
  district_id: "",
  org_unit_id: "",
  patrol_type: "routine",
  patrol_leader_id: "",
  personnel_count: 1,
  vehicle_id: "",
  odometer_start_km: "",
  odometer_end_km: "",
  fuel_used_litres: "",
  route_summary: "",
  incidents_count: 0,
  incidents: "",
  observations: "",
  status: "submitted" as PatrolStatus,
});

export default function PatrolLogTab({
  units, canReview, homeUnitId,
}: { units: OrgUnit[]; canReview: boolean; homeUnitId?: string | null }) {
  const { data: logs = [], isLoading, error } = usePatrolLogs(90);
  const { data: districts = [] } = useGhanaDistricts();
  const { data: vehicles = [] } = useFleetVehicles();
  const { data: staff = [] } = usePatrolStaffOptions();

  const create = useCreatePatrolLog();
  const update = useUpdatePatrolLog();
  const review = useReviewPatrolLog();
  const remove = useDeletePatrolLog();

  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatrolLog | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [files, setFiles] = useState<File[]>([]);
  const [photosFor, setPhotosFor] = useState<PatrolLog | null>(null);

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id))),
    [units],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (openOnly && !isPatrolOpen(l.status)) return false;
      if (!q) return true;
      return [l.patrol_reference, l.district_name, l.patrol_type, l.incidents, l.route_summary]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [logs, openOnly, search]);

  const totalIncidents = logs.reduce((s, l) => s + (l.incidents_count || 0), 0);
  const pending = logs.filter((l) => isPatrolOpen(l.status)).length;

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm(), org_unit_id: homeUnitId ?? "" });
    setFiles([]);
    setFormOpen(true);
  }

  function openEdit(l: PatrolLog) {
    setEditing(l);
    setForm({
      patrol_date: l.patrol_date,
      start_time: (l.start_time ?? "").slice(0, 5),
      end_time: (l.end_time ?? "").slice(0, 5),
      district_id: l.district_id ?? "",
      org_unit_id: l.org_unit_id ?? "",
      patrol_type: l.patrol_type,
      patrol_leader_id: l.patrol_leader_id ?? "",
      personnel_count: l.personnel_count ?? 0,
      vehicle_id: l.vehicle_id ?? "",
      odometer_start_km: l.odometer_start_km != null ? String(l.odometer_start_km) : "",
      odometer_end_km: l.odometer_end_km != null ? String(l.odometer_end_km) : "",
      fuel_used_litres: l.fuel_used_litres != null ? String(l.fuel_used_litres) : "",
      route_summary: l.route_summary ?? "",
      incidents_count: l.incidents_count ?? 0,
      incidents: l.incidents ?? "",
      observations: l.observations ?? "",
      status: (l.status as PatrolStatus) ?? "submitted",
    });
    setFiles([]);
    setFormOpen(true);
  }

  async function pickFiles(list: FileList | null) {
    const next = Array.from(list ?? []);
    const bad = (await Promise.all(next.map(validatePatrolPhoto))).find(Boolean);
    if (bad) {
      toast.error(bad);
      return;
    }
    setFiles(next);
  }

  async function save() {
    if (!form.start_time) {
      toast.error("Patrol start time is required");
      return;
    }
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const odoStart = num(form.odometer_start_km);
    const odoEnd = num(form.odometer_end_km);
    if (!form.vehicle_id && (odoStart != null || odoEnd != null || num(form.fuel_used_litres) != null)) {
      toast.error("Attach a vehicle before recording odometer or fuel usage");
      return;
    }
    if (odoStart != null && odoEnd != null && odoEnd < odoStart) {
      toast.error("Odometer end reading cannot be lower than the start reading");
      return;
    }
    const payload = {
      patrol_date: form.patrol_date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      district_id: form.district_id || null,
      org_unit_id: form.org_unit_id || null,
      patrol_type: form.patrol_type,
      patrol_leader_id: form.patrol_leader_id || null,
      personnel_count: Number(form.personnel_count) || 0,
      vehicle_id: form.vehicle_id || null,
      odometer_start_km: form.vehicle_id ? odoStart : null,
      odometer_end_km: form.vehicle_id ? odoEnd : null,
      fuel_used_litres: form.vehicle_id ? num(form.fuel_used_litres) : null,
      route_summary: form.route_summary || null,
      incidents_count: Number(form.incidents_count) || 0,
      incidents: form.incidents || null,
      observations: form.observations || null,
      status: form.status,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload, photos: files });
        toast.success(`Patrol ${editing.patrol_reference} updated`);
      } else {
        const created = await create.mutateAsync({ ...payload, photos: files });
        toast.success(`Patrol ${created.patrol_reference} logged`);
      }
      setFormOpen(false);
      setFiles([]);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function setStatus(l: PatrolLog, status: PatrolStatus) {
    try {
      await review.mutateAsync({ id: l.id, status });
      toast.success(`Patrol ${l.patrol_reference} marked ${status}`);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  async function del(l: PatrolLog) {
    try {
      await remove.mutateAsync(l.id);
      toast.success(`Patrol ${l.patrol_reference} deleted`);
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
              <Footprints className="h-4 w-4 text-primary" aria-hidden="true" />
              Patrol log
            </CardTitle>
            <CardDescription>
              {logs.length} patrols · {pending} awaiting review · {totalIncidents} incidents recorded
              (90 days, my command only)
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Log patrol
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={openOnly ? "default" : "outline"}
              onClick={() => setOpenOnly((v) => !v)}
            >
              {openOnly ? "Awaiting review" : "All statuses"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, district, incident…"
                className="w-[260px] pl-8"
                aria-label="Search patrol logs"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">Could not load patrols: {errMessage(error)}</p>
          )}

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Strength</TableHead>
                  <TableHead>Incidents</TableHead>
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
                      No patrols logged yet.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.patrol_reference}</TableCell>
                    <TableCell>{formatDate(l.patrol_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(l.start_time ?? "").slice(0, 5)}
                      {l.end_time ? ` – ${l.end_time.slice(0, 5)}` : ""}
                    </TableCell>
                    <TableCell>{l.district_name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{label(l.patrol_type)}</TableCell>
                    <TableCell>{l.personnel_count}</TableCell>
                    <TableCell>{l.incidents_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${STATUS_CLASS[l.status] ?? ""}`}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setPhotosFor(l)}>
                        <Images className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Photos for {l.patrol_reference}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                        Edit
                      </Button>
                      {canReview && isPatrolOpen(l.status) && (
                        <Button size="sm" onClick={() => setStatus(l, "reviewed")}>
                          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          Review
                        </Button>
                      )}
                      {canReview && l.status === "reviewed" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(l, "closed")}>
                          Close
                        </Button>
                      )}
                      {l.status === "draft" && (
                        <Button size="sm" variant="ghost" onClick={() => del(l)}>
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          <span className="sr-only">Delete {l.patrol_reference}</span>
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

      {/* ── Patrol form ──────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.patrol_reference}` : "Log a patrol"}</DialogTitle>
            <DialogDescription>
              Date, time, district and incidents. Entries roll up to the unit dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="patrol-date">Patrol date</Label>
              <DateInput
                id="patrol-date"
                value={form.patrol_date}
                onChange={(e) => setForm((f) => ({ ...f, patrol_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="patrol-start">Start time</Label>
                <Input
                  id="patrol-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patrol-end">End time</Label>
                <Input
                  id="patrol-end"
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
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.region}
                    </SelectItem>
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
                  {PATROL_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{label(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Patrol leader</Label>
              <StaffCombobox
                staff={staff}
                value={form.patrol_leader_id}
                onValueChange={(v) => setForm((f) => ({ ...f, patrol_leader_id: v }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patrol-strength">Personnel strength</Label>
              <Input
                id="patrol-strength"
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
              <Label htmlFor="patrol-odo-start">Odometer start (km)</Label>
              <Input
                id="patrol-odo-start"
                type="number"
                min={0}
                step="0.1"
                disabled={!form.vehicle_id}
                value={form.odometer_start_km}
                onChange={(e) => setForm((f) => ({ ...f, odometer_start_km: e.target.value }))}
                placeholder={form.vehicle_id ? "e.g. 48210" : "Attach a vehicle first"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patrol-odo-end">Odometer end (km)</Label>
              <Input
                id="patrol-odo-end"
                type="number"
                min={0}
                step="0.1"
                disabled={!form.vehicle_id}
                value={form.odometer_end_km}
                onChange={(e) => setForm((f) => ({ ...f, odometer_end_km: e.target.value }))}
                placeholder={form.vehicle_id ? "e.g. 48297" : "Attach a vehicle first"}
              />
              {form.odometer_start_km && form.odometer_end_km && (
                <p className="text-xs text-muted-foreground">
                  Distance: {Math.max(Number(form.odometer_end_km) - Number(form.odometer_start_km), 0).toFixed(1)} km
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patrol-fuel">Fuel used (litres)</Label>
              <Input
                id="patrol-fuel"
                type="number"
                min={0}
                step="0.1"
                disabled={!form.vehicle_id}
                value={form.fuel_used_litres}
                onChange={(e) => setForm((f) => ({ ...f, fuel_used_litres: e.target.value }))}
                placeholder={form.vehicle_id ? "e.g. 12.5" : "Attach a vehicle first"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patrol-incident-count">Incidents encountered</Label>
              <Input
                id="patrol-incident-count"
                type="number"
                min={0}
                value={form.incidents_count}
                onChange={(e) => setForm((f) => ({ ...f, incidents_count: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as PatrolStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PATROL_STATUSES.filter((s) => canReview || s === "draft" || s === "submitted").map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="patrol-route">Route / area covered</Label>
              <Textarea
                id="patrol-route"
                rows={2}
                value={form.route_summary}
                onChange={(e) => setForm((f) => ({ ...f, route_summary: e.target.value }))}
                placeholder="Checkpoints, landmarks and routes covered"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="patrol-incidents">Incident details</Label>
              <Textarea
                id="patrol-incidents"
                rows={3}
                value={form.incidents}
                onChange={(e) => setForm((f) => ({ ...f, incidents: e.target.value }))}
                placeholder="What happened, who was involved and the action taken"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="patrol-observations">Observations</Label>
              <Textarea
                id="patrol-observations"
                rows={2}
                value={form.observations}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="patrol-photos">Photos (JPEG, PNG or WebP, under 3MB each)</Label>
              <Input
                id="patrol-photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => pickFiles(e.target.files)}
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">{files.length} photo(s) ready to upload</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Log patrol"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PatrolPhotosDialog log={photosFor} onClose={() => setPhotosFor(null)} />
    </div>
  );
}

function PatrolPhotosDialog({ log, onClose }: { log: PatrolLog | null; onClose: () => void }) {
  const { data: photos = [], isLoading } = usePatrolPhotos(log?.id ?? null);
  const del = useDeletePatrolPhoto();

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Photos · {log?.patrol_reference}</DialogTitle>
          <DialogDescription>
            {log?.district_name ?? "No district"} · {log ? formatDate(log.patrol_date) : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />}
        {!isLoading && photos.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No photos attached.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border border-border p-2">
              {p.signedUrl ? (
                <img
                  src={p.signedUrl}
                  alt={p.caption || `Patrol photo for ${log?.patrol_reference}`}
                  loading="lazy"
                  className="h-40 w-full rounded object-cover"
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  Preview unavailable
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => del.mutate(p)}
                disabled={del.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />
                Remove
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
