/** Remote immobilisation — authorised lock / unlock with a full audit trail. */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import { setImmobilizer, useImmobilizerLog } from "@/hooks/useFleetComms";
import { MOVING_SPEED_KPH, vehicleLabel, type FleetVehicle } from "@/lib/fleet";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
}

const MIN_REASON = 10;

export function FleetImmobilizerTab({ vehicles, canManage }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ vehicle: FleetVehicle; lock: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const logQuery = useImmobilizerLog("all", canManage);
  const log = logQuery.data ?? [];
  const vehicleName = useMemo(
    () => new Map(vehicles.map((v) => [v.id, vehicleLabel(v)])),
    [vehicles],
  );

  const listed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? vehicles.filter((v) => vehicleLabel(v).toLowerCase().includes(term))
      : vehicles;
    return [...rows].sort((a, b) =>
      Number(b.immobilized) - Number(a.immobilized)
      || a.registration_number.localeCompare(b.registration_number));
  }, [vehicles, search]);

  const submit = async () => {
    if (!target || reason.trim().length < MIN_REASON) return;
    setBusy(true);
    try {
      await setImmobilizer(target.vehicle.id, target.lock, reason.trim());
      toast({
        title: target.lock ? "Immobiliser engaged" : "Immobiliser released",
        description: `${vehicleLabel(target.vehicle)} — the driver has been notified and the action logged.`,
      });
      setTarget(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Command rejected", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const immobilised = vehicles.filter((v) => v.immobilized).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" aria-hidden="true" />
              Remote immobilisation
            </CardTitle>
            <CardDescription>
              Lock or release a vehicle's starter remotely. A reason is mandatory and locking is blocked
              above 20 km/h for driver safety.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={immobilised ? "border-destructive/40 bg-destructive/10 text-destructive" : undefined}>
              {immobilised} immobilised
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicles"
            aria-label="Search vehicles to immobilise"
            className="sm:max-w-sm"
          />
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Immobiliser</TableHead>
                  <TableHead>Speed</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Reason on file</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">No vehicles found.</TableCell>
                  </TableRow>
                )}
                {listed.map((v) => {
                  const moving = Number(v.last_speed_kph ?? 0) > MOVING_SPEED_KPH;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{vehicleLabel(v)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={v.immobilized
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-success/30 bg-success/15 text-success"}
                        >
                          {v.immobilized ? "Locked" : "Unlocked"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {v.last_speed_kph != null ? `${Math.round(Number(v.last_speed_kph))} km/h` : "—"}
                        {moving && <span className="ml-1 text-xs text-muted-foreground">moving</span>}
                      </TableCell>
                      <TableCell>
                        {v.immobilized_at ? format(new Date(v.immobilized_at), "dd/MM/yyyy HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {v.immobilizer_reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          className={v.immobilized ? undefined : "border-destructive/40 text-destructive hover:bg-destructive/10"}
                          onClick={() => { setTarget({ vehicle: v, lock: !v.immobilized }); setReason(""); }}
                        >
                          {v.immobilized
                            ? (<><LockOpen className="mr-1 h-4 w-4" aria-hidden="true" />Release</>)
                            : (<><Lock className="mr-1 h-4 w-4" aria-hidden="true" />Immobilise</>)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Immobiliser audit trail</CardTitle>
          <CardDescription>Every lock and release, immutable once written.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[320px]">
            <ul className="divide-y divide-border">
              {log.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">No immobiliser commands recorded.</li>
              )}
              {log.map((c) => (
                <li key={c.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={c.command === "lock"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-success/30 bg-success/15 text-success"}
                    >
                      {c.command === "lock" ? "Immobilised" : "Released"}
                    </Badge>
                    <span className="font-medium">{vehicleName.get(c.vehicle_id) ?? "Vehicle"}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}
                      {c.issued_by_label ? ` · ${c.issued_by_label}` : ""}
                      {` · ${c.status}`}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{c.reason}</p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.lock ? "Immobilise" : "Release"} {target?.vehicle.registration_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.lock
                ? "The starter will be locked at the next tracker handshake and the driver notified in the cab."
                : "The starter lock will be lifted and the driver notified that the vehicle is cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="immobilizer-reason">Reason (required, min {MIN_REASON} characters)</Label>
            <Textarea
              id="immobilizer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Authority and grounds for this command"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={busy || reason.trim().length < MIN_REASON}>
              {busy ? "Sending…" : target?.lock ? "Immobilise vehicle" : "Release vehicle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
