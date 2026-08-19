/** Vehicle register — create, edit, retire vehicles and assign drivers. */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Truck } from "lucide-react";
import {
  VEHICLE_STATUS_CLASSES, VEHICLE_STATUS_LABELS, VEHICLE_TYPES,
  motionState, MOTION_CLASSES, MOTION_LABELS, vehicleLabel, isLowFuel,
  type FleetVehicle, type VehicleStatus,
} from "@/lib/fleet";

/** Relative "last heard from" label for tracker check-ins. */
function lastSeenLabel(at: string | null): string {
  if (!at) return "Never";
  const mins = Math.floor((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
  isAdmin: boolean;
}

interface FormState {
  registration_number: string;
  call_sign: string;
  make: string;
  model: string;
  model_year: string;
  vehicle_type: string;
  status: VehicleStatus;
  device_id: string;
  fuel_capacity_litres: string;
  odometer_km: string;
  speed_limit_kph: string;
  low_fuel_threshold_pct: string;
  fuel_drop_threshold_pct: string;
  assigned_driver_id: string;
  org_unit_id: string;
  notes: string;
}

const EMPTY: FormState = {
  registration_number: "", call_sign: "", make: "", model: "", model_year: "",
  vehicle_type: "patrol", status: "active", device_id: "", fuel_capacity_litres: "",
  odometer_km: "0", speed_limit_kph: "80", low_fuel_threshold_pct: "20",
  fuel_drop_threshold_pct: "12", assigned_driver_id: "none", org_unit_id: "none", notes: "",
};

function toForm(v: FleetVehicle): FormState {
  return {
    registration_number: v.registration_number,
    call_sign: v.call_sign ?? "",
    make: v.make ?? "",
    model: v.model ?? "",
    model_year: v.model_year?.toString() ?? "",
    vehicle_type: v.vehicle_type,
    status: v.status,
    device_id: v.device_id ?? "",
    fuel_capacity_litres: v.fuel_capacity_litres?.toString() ?? "",
    odometer_km: v.odometer_km?.toString() ?? "0",
    speed_limit_kph: v.speed_limit_kph?.toString() ?? "80",
    low_fuel_threshold_pct: v.low_fuel_threshold_pct?.toString() ?? "20",
    fuel_drop_threshold_pct: v.fuel_drop_threshold_pct?.toString() ?? "12",
    assigned_driver_id: v.assigned_driver_id ?? "none",
    org_unit_id: v.org_unit_id ?? "none",
    notes: v.notes ?? "",
  };
}

export function FleetVehiclesTab({ vehicles, canManage, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VehicleStatus>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FleetVehicle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FleetVehicle | null>(null);

  const driversQuery = useQuery({
    queryKey: ["fleet", "drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("status", "active")
        .order("last_name")
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        staff_id: d.staff_id,
        full_name: [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.staff_id || "Unnamed",
      }));
    },
  });

  const unitsQuery = useQuery({
    queryKey: ["fleet", "org-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, code")
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitName = (id: string | null) =>
    (unitsQuery.data ?? []).find((u: any) => u.id === id)?.name ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!term) return true;
      return [v.registration_number, v.call_sign, v.make, v.model, v.device_id]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term));
    });
  }, [vehicles, search, statusFilter]);

  const startCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (v: FleetVehicle) => { setEditing(v); setForm(toForm(v)); setOpen(true); };

  const num = (value: string) => (value.trim() === "" ? null : Number(value));

  const save = async () => {
    if (!form.registration_number.trim()) {
      toast({ title: "Registration number is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        registration_number: form.registration_number.trim().toUpperCase(),
        call_sign: form.call_sign.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        model_year: num(form.model_year),
        vehicle_type: form.vehicle_type,
        status: form.status,
        device_id: form.device_id.trim() || null,
        fuel_capacity_litres: num(form.fuel_capacity_litres),
        odometer_km: num(form.odometer_km) ?? 0,
        speed_limit_kph: num(form.speed_limit_kph) ?? 80,
        low_fuel_threshold_pct: num(form.low_fuel_threshold_pct) ?? 20,
        fuel_drop_threshold_pct: num(form.fuel_drop_threshold_pct) ?? 12,
        assigned_driver_id: form.assigned_driver_id === "none" ? null : form.assigned_driver_id,
        org_unit_id: form.org_unit_id === "none" ? null : form.org_unit_id,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("fleet_vehicles").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fleet_vehicles")
          .insert({ ...payload, created_by: authData.user?.id ?? null });
        if (error) throw error;
      }
      toast({ title: editing ? "Vehicle updated" : "Vehicle added" });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Could not save vehicle", description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("fleet_vehicles").delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Could not remove vehicle", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vehicle removed" });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    }
    setDeleting(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" aria-hidden="true" />
            Vehicle register
          </CardTitle>
          <CardDescription>{vehicles.length} vehicle(s) on strength</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Registration, tracker…"
              className="w-52 pl-8"
              aria-label="Search vehicles"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(VEHICLE_STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <Button onClick={startCreate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Add vehicle
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Tracker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Live</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Fuel</TableHead>
                <TableHead>Assigned unit</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No vehicles match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((v) => {
                const state = motionState(v);
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="font-medium">{vehicleLabel(v)}</div>
                      <div className="text-xs text-muted-foreground">
                        {[v.make, v.model, v.model_year].filter(Boolean).join(" ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{v.vehicle_type}</TableCell>
                    <TableCell className="font-mono text-xs">{v.device_id ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={VEHICLE_STATUS_CLASSES[v.status]}>
                        {VEHICLE_STATUS_LABELS[v.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={MOTION_CLASSES[state]}>{MOTION_LABELS[state]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {lastSeenLabel(v.last_seen_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.last_fuel_level_pct == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={isLowFuel(v) ? "font-medium text-destructive" : ""}>
                          {Math.round(Number(v.last_fuel_level_pct))}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{unitName(v.org_unit_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {Math.round(Number(v.odometer_km ?? 0)).toLocaleString()} km
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => startEdit(v)} aria-label={`Edit ${v.registration_number}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(v)} aria-label={`Remove ${v.registration_number}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
            <DialogDescription>
              Tracker ID links the vehicle to the device that posts positions to the ingest endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fv-reg">Registration number *</Label>
              <Input id="fv-reg" value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="GS 1234-26" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-call">Call sign</Label>
              <Input id="fv-call" value={form.call_sign} onChange={(e) => setForm({ ...form, call_sign: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-make">Make</Label>
              <Input id="fv-make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-model">Model</Label>
              <Input id="fv-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-year">Year</Label>
              <Input id="fv-year" inputMode="numeric" value={form.model_year}
                onChange={(e) => setForm({ ...form, model_year: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-type">Vehicle type</Label>
              <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                <SelectTrigger id="fv-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as VehicleStatus })}>
                <SelectTrigger id="fv-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_STATUS_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-device">Tracker / device ID</Label>
              <Input id="fv-device" value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-driver">Assigned driver</Label>
              <Select value={form.assigned_driver_id} onValueChange={(v) => setForm({ ...form, assigned_driver_id: v })}>
                <SelectTrigger id="fv-driver"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(driversQuery.data ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name} {d.staff_id ? `(${d.staff_id})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-unit">Assigned unit</Label>
              <Select value={form.org_unit_id} onValueChange={(v) => setForm({ ...form, org_unit_id: v })}>
                <SelectTrigger id="fv-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(unitsQuery.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.code ? ` (${u.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-tank">Tank capacity (litres)</Label>
              <Input id="fv-tank" inputMode="decimal" value={form.fuel_capacity_litres}
                onChange={(e) => setForm({ ...form, fuel_capacity_litres: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-odo">Odometer (km)</Label>
              <Input id="fv-odo" inputMode="decimal" value={form.odometer_km}
                onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-speed">Speed limit (km/h)</Label>
              <Input id="fv-speed" inputMode="numeric" value={form.speed_limit_kph}
                onChange={(e) => setForm({ ...form, speed_limit_kph: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-low">Low fuel alert at (%)</Label>
              <Input id="fv-low" inputMode="numeric" value={form.low_fuel_threshold_pct}
                onChange={(e) => setForm({ ...form, low_fuel_threshold_pct: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fv-drop">Fuel-theft alert on drop of (%)</Label>
              <Input id="fv-drop" inputMode="numeric" value={form.fuel_drop_threshold_pct}
                onChange={(e) => setForm({ ...form, fuel_drop_threshold_pct: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fv-notes">Notes</Label>
              <Textarea id="fv-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save vehicle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.registration_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the vehicle along with its tracking history, fuel readings and alerts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
