/**
 * PATROL VEHICLE LOG — record the vehicle, odometer readings and fuel used for
 * a patrol straight from the Fleet Dashboard.
 *
 * The patrol entry itself is created in the Command Console; this dialog only
 * captures the vehicle-usage side of it so fleet staff can close the odometer
 * and fuel gaps without leaving the dashboard. Writes go through
 * `useUpdatePatrolLog`, so the database trigger that validates readings and
 * pushes the vehicle's odometer forward still applies.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useUpdatePatrolLog, type PatrolLog } from "@/hooks/usePatrolLogs";

const FOOT_PATROL = "__foot__";

interface Props {
  /** Patrol entry being annotated; `null` closes the dialog. */
  log: PatrolLog | null;
  onClose: () => void;
}

/** Parse a numeric field, returning null for blanks so the column clears. */
function toNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function PatrolVehicleLogDialog({ log, onClose }: Props) {
  const { data: vehicles = [] } = useFleetVehicles(!!log);
  const update = useUpdatePatrolLog();

  const [vehicleId, setVehicleId] = useState(FOOT_PATROL);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [fuel, setFuel] = useState("");

  // Re-seed the form each time a different patrol is opened.
  useEffect(() => {
    if (!log) return;
    setVehicleId(log.vehicle_id ?? FOOT_PATROL);
    setStart(log.odometer_start_km != null ? String(log.odometer_start_km) : "");
    setEnd(log.odometer_end_km != null ? String(log.odometer_end_km) : "");
    setFuel(log.fuel_used_litres != null ? String(log.fuel_used_litres) : "");
  }, [log]);

  const selected = vehicles.find((v) => v.id === vehicleId);

  const distance = useMemo(() => {
    const a = toNumber(start);
    const b = toNumber(end);
    if (a == null || b == null) return null;
    return b - a;
  }, [start, end]);

  const economy = useMemo(() => {
    const litres = toNumber(fuel);
    if (!litres || distance == null || distance <= 0) return null;
    return distance / litres;
  }, [distance, fuel]);

  async function save() {
    if (!log) return;
    const startKm = toNumber(start);
    const endKm = toNumber(end);
    const litres = toNumber(fuel);

    if (vehicleId === FOOT_PATROL && (startKm != null || endKm != null || litres != null)) {
      toast.error("Pick the patrol vehicle before recording odometer or fuel figures");
      return;
    }
    if (startKm != null && startKm < 0) {
      toast.error("Odometer readings cannot be negative");
      return;
    }
    if (distance != null && distance < 0) {
      toast.error("Closing odometer cannot be lower than the opening reading");
      return;
    }
    if (litres != null && litres < 0) {
      toast.error("Fuel used cannot be negative");
      return;
    }

    try {
      await update.mutateAsync({
        id: log.id,
        vehicle_id: vehicleId === FOOT_PATROL ? null : vehicleId,
        odometer_start_km: vehicleId === FOOT_PATROL ? null : startKm,
        odometer_end_km: vehicleId === FOOT_PATROL ? null : endKm,
        fuel_used_litres: vehicleId === FOOT_PATROL ? null : litres,
      });
      toast.success(
        vehicleId === FOOT_PATROL
          ? `${log.patrol_reference} recorded as a foot patrol`
          : `Vehicle log saved for ${log.patrol_reference}`,
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the vehicle log");
    }
  }

  return (
    <Dialog open={!!log} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            Patrol vehicle log
          </DialogTitle>
          <DialogDescription>
            {log
              ? `${log.patrol_reference} · ${formatDate(log.patrol_date)} · ${log.district_name ?? "district not set"}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="patrol-vehicle">Assigned vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="patrol-vehicle">
                <SelectValue placeholder="Select the patrol vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOOT_PATROL}>Foot patrol — no vehicle</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration_number}
                    {v.call_sign ? ` · ${v.call_sign}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Vehicle odometer on record: {Number(selected.odometer_km ?? 0).toLocaleString()} km
                {selected.last_fuel_level_pct != null ? ` · fuel ${selected.last_fuel_level_pct}%` : ""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="odo-start">Odometer out (km)</Label>
              <Input
                id="odo-start"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={vehicleId === FOOT_PATROL}
                placeholder="e.g. 48200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="odo-end">Odometer in (km)</Label>
              <Input
                id="odo-end"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={vehicleId === FOOT_PATROL}
                placeholder="e.g. 48287.5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fuel-used">Fuel used (litres)</Label>
            <Input
              id="fuel-used"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={fuel}
              onChange={(e) => setFuel(e.target.value)}
              disabled={vehicleId === FOOT_PATROL}
              placeholder="e.g. 12.5"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p>
              Distance:{" "}
              <span className="font-medium">
                {distance != null ? `${distance.toFixed(1)} km` : "—"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Fuel economy: {economy != null ? `${economy.toFixed(2)} km/L` : "—"}
            </p>
            {distance != null && distance < 0 && (
              <p className="mt-1 text-destructive">
                Closing reading is below the opening reading.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save vehicle log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
