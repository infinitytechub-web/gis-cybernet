/** Alert centre — panic/SOS first, then geofence, speeding and fuel alerts. */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { BellRing, Check, CheckCheck, X, Siren } from "lucide-react";
import { setAlertStatus } from "@/hooks/useFleet";
import {
  ALERT_STATUS_LABELS, ALERT_TYPE_LABELS, SEVERITY_CLASSES,
  type FleetAlert, type FleetVehicle,
} from "@/lib/fleet";

interface Props {
  alerts: FleetAlert[];
  vehicles: FleetVehicle[];
  canManage: boolean;
  onFocusVehicle?: (vehicleId: string) => void;
}

export function FleetAlertsTab({ alerts, vehicles, canManage, onFocusVehicle }: Props) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<"all" | FleetAlert["alert_type"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FleetAlert["status"]>("all");
  const [resolving, setResolving] = useState<FleetAlert | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const regByVehicle = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles) map.set(v.id, v.registration_number);
    return map;
  }, [vehicles]);

  const filtered = useMemo(
    () => alerts.filter((a) =>
      (typeFilter === "all" || a.alert_type === typeFilter)
      && (statusFilter === "all" || a.status === statusFilter)),
    [alerts, typeFilter, statusFilter],
  );

  const panic = filtered.filter((a) => a.alert_type === "panic" && a.status === "new");

  const action = async (alert: FleetAlert, status: FleetAlert["status"], note?: string) => {
    setBusy(true);
    try {
      await setAlertStatus(alert.id, status, note);
      toast({ title: `Alert ${ALERT_STATUS_LABELS[status].toLowerCase()}` });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
      setResolving(null);
      setNotes("");
    } catch (error: any) {
      toast({ title: "Could not update alert", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {panic.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Siren className="h-5 w-5 animate-pulse" aria-hidden="true" />
              {panic.length} active panic / SOS {panic.length === 1 ? "alert" : "alerts"}
            </CardTitle>
            <CardDescription>Dispatch a response and acknowledge so the crew can see help is coming.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {panic.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{a.message}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(a.occurred_at), "dd/MM/yyyy HH:mm")}
                    {a.lat != null && a.lng != null && ` · ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.vehicle_id && onFocusVehicle && (
                    <Button variant="outline" size="sm" onClick={() => onFocusVehicle(a.vehicle_id!)}>
                      Locate
                    </Button>
                  )}
                  {canManage && (
                    <Button size="sm" onClick={() => action(a, "acknowledged")} disabled={busy}>
                      <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
              Alert centre
            </CardTitle>
            <CardDescription>{filtered.length} alert(s) shown</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-44" aria-label="Filter by alert type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(ALERT_TYPE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(ALERT_STATUS_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No alerts for the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(a.occurred_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>{a.vehicle_id ? regByVehicle.get(a.vehicle_id) ?? "—" : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SEVERITY_CLASSES[a.severity]}>
                        {ALERT_TYPE_LABELS[a.alert_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm text-sm">{a.message}</TableCell>
                    <TableCell className="text-sm">{ALERT_STATUS_LABELS[a.status]}</TableCell>
                    <TableCell className="text-right">
                      {canManage && a.status === "new" && (
                        <Button variant="ghost" size="icon" onClick={() => action(a, "acknowledged")}
                          disabled={busy} aria-label="Acknowledge alert">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (a.status === "new" || a.status === "acknowledged") && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setResolving(a); setNotes(""); }}
                            aria-label="Resolve alert">
                            <CheckCheck className="h-4 w-4 text-success" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => action(a, "dismissed")}
                            disabled={busy} aria-label="Dismiss alert">
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve alert</DialogTitle>
            <DialogDescription>{resolving?.message}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="fa-notes">Resolution notes</Label>
            <Textarea id="fa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Action taken, who responded, outcome…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button onClick={() => resolving && action(resolving, "resolved", notes.trim() || undefined)} disabled={busy}>
              {busy ? "Saving…" : "Mark resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
