/**
 * VEHICLE MAINTENANCE — service logs, odometer readings and the preventive
 * maintenance schedule for every vehicle on strength.
 *
 * Writes are RLS-gated to fleet managers; everyone else gets the read-only
 * picture. Saving a completed service pushes the vehicle odometer forward and
 * resets the matching schedule server-side.
 */
import { useMemo, useState } from "react";
import { Wrench, Plus, CalendarClock, Trash2, Pencil, AlertTriangle, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { vehicleLabel, type FleetVehicle } from "@/lib/fleet";
import {
  SERVICE_TYPES, DUE_LABEL, DUE_TONE,
  useMaintenanceRecords, useMaintenanceSchedules, useMaintenanceStatus,
  useSaveMaintenanceRecord, useDeleteMaintenanceRecord,
  useSaveMaintenanceSchedule, useDeleteMaintenanceSchedule,
  type MaintenanceRecord, type MaintenanceSchedule,
} from "@/hooks/useFleetMaintenance";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
}

const ddmmyyyy = (d?: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB") : "—";
const num = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const EMPTY_LOG = {
  id: "", vehicle_id: "", service_type: SERVICE_TYPES[0] as string,
  service_date: new Date().toISOString().slice(0, 10),
  odometer_km: "", cost: "", workshop: "", parts_replaced: "", downtime_days: "",
  status: "completed", notes: "",
};

const EMPTY_SCHEDULE = {
  id: "", vehicle_id: "", service_type: SERVICE_TYPES[0] as string,
  interval_km: "", interval_days: "", last_service_odometer_km: "", last_service_date: "", notes: "",
};

export function FleetMaintenanceTab({ vehicles, canManage }: Props) {
  const records = useMaintenanceRecords(365);
  const schedules = useMaintenanceSchedules();
  const status = useMaintenanceStatus();
  const saveRecord = useSaveMaintenanceRecord();
  const delRecord = useDeleteMaintenanceRecord();
  const saveSchedule = useSaveMaintenanceSchedule();
  const delSchedule = useDeleteMaintenanceSchedule();

  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState(EMPTY_LOG);
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState(EMPTY_SCHEDULE);
  const [vehicleFilter, setVehicleFilter] = useState<string | "all">("all");

  const label = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? vehicleLabel(v) : "Unknown vehicle";
  };

  const rows = useMemo(() => {
    const list = records.data ?? [];
    return vehicleFilter === "all" ? list : list.filter((r) => r.vehicle_id === vehicleFilter);
  }, [records.data, vehicleFilter]);

  const statusRows = useMemo(() => {
    const list = status.data ?? [];
    const ranked = { overdue: 0, due_soon: 1, ok: 2, unscheduled: 3 } as Record<string, number>;
    return [...list].sort((a, b) => (ranked[a.due_state] ?? 9) - (ranked[b.due_state] ?? 9));
  }, [status.data]);

  const overdue = statusRows.filter((r) => r.due_state === "overdue").length;
  const dueSoon = statusRows.filter((r) => r.due_state === "due_soon").length;
  const spend12m = (records.data ?? []).reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const downtime12m = (records.data ?? []).reduce((s, r) => s + Number(r.downtime_days ?? 0), 0);

  function openLog(rec?: MaintenanceRecord) {
    setLogForm(
      rec
        ? {
            id: rec.id,
            vehicle_id: rec.vehicle_id,
            service_type: rec.service_type,
            service_date: rec.service_date,
            odometer_km: rec.odometer_km != null ? String(rec.odometer_km) : "",
            cost: rec.cost != null ? String(rec.cost) : "",
            workshop: rec.workshop ?? "",
            parts_replaced: rec.parts_replaced ?? "",
            downtime_days: rec.downtime_days != null ? String(rec.downtime_days) : "",
            status: rec.status,
            notes: rec.notes ?? "",
          }
        : { ...EMPTY_LOG, vehicle_id: vehicleFilter !== "all" ? vehicleFilter : vehicles[0]?.id ?? "" },
    );
    setLogOpen(true);
  }

  function openSchedule(s?: MaintenanceSchedule) {
    setSchedForm(
      s
        ? {
            id: s.id,
            vehicle_id: s.vehicle_id,
            service_type: s.service_type,
            interval_km: s.interval_km != null ? String(s.interval_km) : "",
            interval_days: s.interval_days != null ? String(s.interval_days) : "",
            last_service_odometer_km:
              s.last_service_odometer_km != null ? String(s.last_service_odometer_km) : "",
            last_service_date: s.last_service_date ?? "",
            notes: s.notes ?? "",
          }
        : { ...EMPTY_SCHEDULE, vehicle_id: vehicleFilter !== "all" ? vehicleFilter : vehicles[0]?.id ?? "" },
    );
    setSchedOpen(true);
  }

  async function submitLog() {
    if (!logForm.vehicle_id) return;
    await saveRecord.mutateAsync({
      id: logForm.id || undefined,
      vehicle_id: logForm.vehicle_id,
      service_type: logForm.service_type,
      service_date: logForm.service_date,
      odometer_km: num(logForm.odometer_km),
      cost: num(logForm.cost),
      workshop: logForm.workshop || null,
      parts_replaced: logForm.parts_replaced || null,
      downtime_days: num(logForm.downtime_days),
      status: logForm.status,
      notes: logForm.notes || null,
    } as any);
    setLogOpen(false);
  }

  async function submitSchedule() {
    if (!schedForm.vehicle_id) return;
    await saveSchedule.mutateAsync({
      id: schedForm.id || undefined,
      vehicle_id: schedForm.vehicle_id,
      service_type: schedForm.service_type,
      interval_km: num(schedForm.interval_km),
      interval_days: num(schedForm.interval_days),
      last_service_odometer_km: num(schedForm.last_service_odometer_km),
      last_service_date: schedForm.last_service_date || null,
      notes: schedForm.notes || null,
    } as any);
    setSchedOpen(false);
  }

  return (
    <div className="space-y-4">
      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">{overdue}</p>
              <p className="text-xs text-muted-foreground">Services overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarClock className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">{dueSoon}</p>
              <p className="text-xs text-muted-foreground">Due soon</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wrench className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">GHS {spend12m.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Maintenance spend (12m)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold">{downtime12m.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Downtime days (12m)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Schedule ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
              Maintenance schedule
            </CardTitle>
            <CardDescription>
              Service intervals in kilometres or days per vehicle. Due dates are worked out from the
              vehicle's live odometer and its last completed service.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => openSchedule()} disabled={vehicles.length === 0}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Schedule
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {status.isLoading && <p className="text-sm text-muted-foreground">Loading schedule…</p>}
          {status.isError && <p className="text-sm text-destructive">Schedule could not be loaded.</p>}
          {!status.isLoading && statusRows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No vehicles on the register yet — add them on the Vehicles tab.
            </p>
          )}
          {statusRows.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Last service</TableHead>
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>State</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusRows.map((r, i) => {
                    const sched = (schedules.data ?? []).find(
                      (s) => s.vehicle_id === r.vehicle_id && s.service_type === r.service_type,
                    );
                    return (
                      <TableRow key={`${r.vehicle_id}-${r.service_type ?? "none"}-${i}`}>
                        <TableCell className="font-medium">
                          {r.registration_number}
                          {r.call_sign && (
                            <span className="ml-2 text-xs text-muted-foreground">{r.call_sign}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.org_unit_name ?? "Unassigned"}</TableCell>
                        <TableCell>{r.service_type ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {[r.interval_km ? `${Number(r.interval_km).toLocaleString()} km` : null,
                            r.interval_days ? `${r.interval_days} days` : null]
                            .filter(Boolean)
                            .join(" / ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ddmmyyyy(r.last_service_date)}
                          {r.last_service_odometer_km != null && (
                            <span className="ml-1 text-muted-foreground">
                              @ {Number(r.last_service_odometer_km).toLocaleString()} km
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.odometer_km != null ? `${Number(r.odometer_km).toLocaleString()} km` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.next_due_km != null && (
                            <div>
                              {Number(r.next_due_km).toLocaleString()} km
                              {r.km_remaining != null && (
                                <span className="ml-1 text-muted-foreground">
                                  ({r.km_remaining >= 0 ? `${Number(r.km_remaining).toFixed(0)} km left` : `${Math.abs(Number(r.km_remaining)).toFixed(0)} km over`})
                                </span>
                              )}
                            </div>
                          )}
                          {r.next_due_date && (
                            <div>
                              {ddmmyyyy(r.next_due_date)}
                              {r.days_remaining != null && (
                                <span className="ml-1 text-muted-foreground">
                                  ({r.days_remaining >= 0 ? `${r.days_remaining}d left` : `${Math.abs(r.days_remaining)}d over`})
                                </span>
                              )}
                            </div>
                          )}
                          {r.next_due_km == null && !r.next_due_date && "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={DUE_TONE[r.due_state] ?? ""}>
                            {DUE_LABEL[r.due_state] ?? r.due_state}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  sched
                                    ? openSchedule(sched)
                                    : openSchedule({
                                        id: "",
                                        vehicle_id: r.vehicle_id,
                                        service_type: r.service_type ?? SERVICE_TYPES[0],
                                      } as MaintenanceSchedule)
                                }
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="sr-only">Edit schedule</span>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  openLog({
                                    id: "",
                                    vehicle_id: r.vehicle_id,
                                    schedule_id: sched?.id ?? null,
                                    service_type: r.service_type ?? SERVICE_TYPES[0],
                                    service_date: new Date().toISOString().slice(0, 10),
                                    odometer_km: r.odometer_km,
                                    cost: null, workshop: null, parts_replaced: null,
                                    downtime_days: null, status: "completed", notes: null,
                                    created_by: null, created_at: "",
                                  })
                                }
                              >
                                <Wrench className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Log service
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Service logs ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" aria-hidden="true" />
              Service logs
            </CardTitle>
            <CardDescription>
              Every completed or planned service with its odometer reading, cost and downtime. Logging a
              completed service moves the vehicle's odometer forward automatically.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={vehicleFilter} onValueChange={(v) => setVehicleFilter(v)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button size="sm" onClick={() => openLog()} disabled={vehicles.length === 0}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Log service
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {records.isLoading && <p className="text-sm text-muted-foreground">Loading service logs…</p>}
          {records.isError && <p className="text-sm text-destructive">Service logs could not be loaded.</p>}
          {!records.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No services logged for this selection.</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead className="text-right">Cost (GHS)</TableHead>
                    <TableHead>Workshop</TableHead>
                    <TableHead className="text-right">Downtime</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{ddmmyyyy(r.service_date)}</TableCell>
                      <TableCell className="font-medium">{label(r.vehicle_id)}</TableCell>
                      <TableCell>{r.service_type}</TableCell>
                      <TableCell className="text-right">
                        {r.odometer_km != null ? `${Number(r.odometer_km).toLocaleString()} km` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.cost != null ? Number(r.cost).toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.workshop ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.downtime_days != null ? `${Number(r.downtime_days)} d` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{r.status}</Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openLog(r)}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => delRecord.mutate(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Log service dialog ──────────────────────────────────────────── */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{logForm.id ? "Edit service log" : "Log a service"}</DialogTitle>
            <DialogDescription>
              Record the workshop visit, the odometer reading taken at service and any downtime.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="m-vehicle">Vehicle</Label>
              <Select
                value={logForm.vehicle_id}
                onValueChange={(v) => setLogForm((f) => ({ ...f, vehicle_id: v }))}
              >
                <SelectTrigger id="m-vehicle"><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="m-type">Service type</Label>
              <Select
                value={logForm.service_type}
                onValueChange={(v) => setLogForm((f) => ({ ...f, service_type: v }))}
              >
                <SelectTrigger id="m-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="m-date">Service date</Label>
              <Input
                id="m-date" type="date" value={logForm.service_date}
                onChange={(e) => setLogForm((f) => ({ ...f, service_date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="m-odo">Odometer (km)</Label>
              <Input
                id="m-odo" inputMode="decimal" value={logForm.odometer_km}
                placeholder="e.g. 48210"
                onChange={(e) => setLogForm((f) => ({ ...f, odometer_km: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="m-cost">Cost (GHS)</Label>
              <Input
                id="m-cost" inputMode="decimal" value={logForm.cost}
                onChange={(e) => setLogForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="m-workshop">Workshop</Label>
              <Input
                id="m-workshop" value={logForm.workshop}
                onChange={(e) => setLogForm((f) => ({ ...f, workshop: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="m-downtime">Downtime (days)</Label>
              <Input
                id="m-downtime" inputMode="decimal" value={logForm.downtime_days}
                onChange={(e) => setLogForm((f) => ({ ...f, downtime_days: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="m-status">Status</Label>
              <Select
                value={logForm.status}
                onValueChange={(v) => setLogForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="m-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_workshop">In workshop</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="m-parts">Parts replaced</Label>
              <Textarea
                id="m-parts" rows={2} value={logForm.parts_replaced}
                onChange={(e) => setLogForm((f) => ({ ...f, parts_replaced: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="m-notes">Notes</Label>
              <Textarea
                id="m-notes" rows={2} value={logForm.notes}
                onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button onClick={submitLog} disabled={!logForm.vehicle_id || saveRecord.isPending}>
              {saveRecord.isPending ? "Saving…" : "Save service log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Schedule dialog ─────────────────────────────────────────────── */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{schedForm.id ? "Edit maintenance schedule" : "Add maintenance schedule"}</DialogTitle>
            <DialogDescription>
              Set the interval in kilometres, days, or both. Whichever falls due first drives the alert.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="s-vehicle">Vehicle</Label>
              <Select
                value={schedForm.vehicle_id}
                onValueChange={(v) => setSchedForm((f) => ({ ...f, vehicle_id: v }))}
              >
                <SelectTrigger id="s-vehicle"><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="s-type">Service type</Label>
              <Select
                value={schedForm.service_type}
                onValueChange={(v) => setSchedForm((f) => ({ ...f, service_type: v }))}
              >
                <SelectTrigger id="s-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="s-km">Interval (km)</Label>
              <Input
                id="s-km" inputMode="decimal" value={schedForm.interval_km} placeholder="e.g. 5000"
                onChange={(e) => setSchedForm((f) => ({ ...f, interval_km: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="s-days">Interval (days)</Label>
              <Input
                id="s-days" inputMode="numeric" value={schedForm.interval_days} placeholder="e.g. 180"
                onChange={(e) => setSchedForm((f) => ({ ...f, interval_days: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="s-last-odo">Last service odometer (km)</Label>
              <Input
                id="s-last-odo" inputMode="decimal" value={schedForm.last_service_odometer_km}
                onChange={(e) => setSchedForm((f) => ({ ...f, last_service_odometer_km: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="s-last-date">Last service date</Label>
              <Input
                id="s-last-date" type="date" value={schedForm.last_service_date}
                onChange={(e) => setSchedForm((f) => ({ ...f, last_service_date: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="s-notes">Notes</Label>
              <Textarea
                id="s-notes" rows={2} value={schedForm.notes}
                onChange={(e) => setSchedForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {schedForm.id ? (
              <Button
                variant="outline"
                onClick={async () => { await delSchedule.mutateAsync(schedForm.id); setSchedOpen(false); }}
              >
                <Trash2 className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />Remove
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSchedOpen(false)}>Cancel</Button>
              <Button onClick={submitSchedule} disabled={!schedForm.vehicle_id || saveSchedule.isPending}>
                {saveSchedule.isPending ? "Saving…" : "Save schedule"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
