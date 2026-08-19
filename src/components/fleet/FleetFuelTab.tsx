/** Fuel monitoring — level per vehicle, consumption trend and refuel logging. */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, BarChart, Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Fuel, Plus, AlertTriangle } from "lucide-react";
import { useFleetFuel } from "@/hooks/useFleet";
import { fuelLitres, isLowFuel, vehicleLabel, type FleetVehicle } from "@/lib/fleet";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
}

export function FleetFuelTab({ vehicles, canManage }: Props) {
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string | "all">("all");
  const [days, setDays] = useState(7);
  const [logOpen, setLogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logForm, setLogForm] = useState({
    vehicle_id: "", event_type: "refuel", litres: "", level_pct: "", cost_ghs: "", odometer_km: "", notes: "",
  });

  const fuelQuery = useFleetFuel(vehicleId, days);
  const readings = fuelQuery.data ?? [];

  const trend = useMemo(() => {
    const byBucket = new Map<string, { time: string; level: number; count: number }>();
    for (const r of readings) {
      if (r.level_pct == null) continue;
      const key = format(new Date(r.recorded_at), days > 2 ? "dd/MM HH:00" : "dd/MM HH:mm");
      const cur = byBucket.get(key) ?? { time: key, level: 0, count: 0 };
      cur.level += Number(r.level_pct);
      cur.count += 1;
      byBucket.set(key, cur);
    }
    return [...byBucket.values()].map((b) => ({ time: b.time, level: Math.round(b.level / b.count) }));
  }, [readings, days]);

  const refuels = useMemo(
    () => readings.filter((r) => r.event_type === "refuel").slice().reverse(),
    [readings],
  );
  const drains = useMemo(() => readings.filter((r) => r.event_type === "drain"), [readings]);

  const consumption = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of readings) {
      if (r.event_type !== "refuel" || r.delta_litres == null) continue;
      const reg = vehicles.find((v) => v.id === r.vehicle_id)?.registration_number ?? "—";
      map.set(reg, (map.get(reg) ?? 0) + Number(r.delta_litres));
    }
    return [...map.entries()]
      .map(([reg, litres]) => ({ reg, litres: Math.round(litres * 10) / 10 }))
      .sort((a, b) => b.litres - a.litres)
      .slice(0, 10);
  }, [readings, vehicles]);

  const lowFuel = vehicles.filter(isLowFuel);

  const openLog = () => {
    setLogForm({
      vehicle_id: vehicleId !== "all" ? vehicleId : vehicles[0]?.id ?? "",
      event_type: "refuel", litres: "", level_pct: "", cost_ghs: "", odometer_km: "", notes: "",
    });
    setLogOpen(true);
  };

  const saveLog = async () => {
    if (!logForm.vehicle_id) {
      toast({ title: "Select a vehicle", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const { error } = await supabase.from("fleet_fuel_readings").insert({
        vehicle_id: logForm.vehicle_id,
        event_type: logForm.event_type as "refuel" | "drain",
        litres: num(logForm.litres),
        delta_litres: num(logForm.litres),
        level_pct: num(logForm.level_pct),
        cost_ghs: num(logForm.cost_ghs),
        odometer_km: num(logForm.odometer_km),
        notes: logForm.notes.trim() || null,
        recorded_by: authData.user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Fuel entry recorded" });
      setLogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["fleet", "fuel"] });
    } catch (error: any) {
      toast({ title: "Could not record entry", description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-primary" aria-hidden="true" />
              Fuel monitoring
            </CardTitle>
            <CardDescription>
              Tracker fuel levels are logged automatically; sudden drops raise a siphoning alert.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={vehicleId} onValueChange={(v) => setVehicleId(v)}>
              <SelectTrigger className="w-52" aria-label="Filter by vehicle"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-36" aria-label="Period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <Button onClick={openLog}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Log refuel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Average tank level</h3>
            {trend.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No fuel readings for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="level" name="Tank level (%)"
                    stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Fuel drawn (litres)</h3>
            {consumption.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No refuels recorded for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={consumption}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="reg" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Bar dataKey="litres" name="Litres" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current tank levels</CardTitle>
            <CardDescription>
              {lowFuel.length > 0
                ? `${lowFuel.length} vehicle(s) at or below their low-fuel threshold`
                : "All vehicles above their low-fuel threshold"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {vehicles.filter((v) => v.last_fuel_level_pct != null).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No tank telemetry yet.</p>
            )}
            {vehicles
              .filter((v) => v.last_fuel_level_pct != null)
              .sort((a, b) => Number(a.last_fuel_level_pct) - Number(b.last_fuel_level_pct))
              .map((v) => {
                const pct = Math.round(Number(v.last_fuel_level_pct));
                const litres = fuelLitres(v);
                return (
                  <div key={v.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{vehicleLabel(v)}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {litres != null && `${litres.toFixed(0)} L · `}{pct}%
                        {isLowFuel(v) && (
                          <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning-foreground">
                            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" /> Low
                          </Badge>
                        )}
                      </span>
                    </div>
                    <Progress value={pct} aria-label={`${v.registration_number} tank level`} />
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refuels & losses</CardTitle>
            <CardDescription>
              {refuels.length} refuel entr{refuels.length === 1 ? "y" : "ies"}
              {drains.length > 0 && ` · ${drains.length} recorded loss(es)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...refuels, ...drains].length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nothing recorded for this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {[...refuels, ...drains].map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(r.recorded_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        {vehicles.find((v) => v.id === r.vehicle_id)?.registration_number ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize">{r.event_type}</TableCell>
                      <TableCell className="text-right">
                        {r.delta_litres != null ? Number(r.delta_litres).toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.cost_ghs != null ? `GHS ${Number(r.cost_ghs).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Consumption log: odometer readings and km/L per entry ─────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuel consumption log</CardTitle>
          <CardDescription>
            Odometer readings per entry, distance covered since the previous reading and fuel economy.
            Log the odometer with every refuel to keep the consumption chart accurate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Distance logged</p>
              <p className="text-lg font-semibold">{consumptionLog.totals.km.toFixed(0)} km</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fuel drawn</p>
              <p className="text-lg font-semibold">{consumptionLog.totals.litres.toFixed(1)} L</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fleet economy</p>
              <p className="text-lg font-semibold">
                {consumptionLog.totals.litres > 0 && consumptionLog.totals.km > 0
                  ? `${(consumptionLog.totals.km / consumptionLog.totals.litres).toFixed(2)} km/L`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Odometer (km)</TableHead>
                  <TableHead className="text-right">Distance (km)</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Economy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumptionLog.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No odometer readings for this period yet.
                    </TableCell>
                  </TableRow>
                )}
                {consumptionLog.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">{row.when}</TableCell>
                    <TableCell>{row.reg}</TableCell>
                    <TableCell className="capitalize">{row.event}</TableCell>
                    <TableCell className="text-right">
                      {row.odometer != null ? row.odometer.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.distance != null ? row.distance.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.litres != null ? row.litres.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.kmPerLitre != null ? (
                        <Badge variant={row.kmPerLitre < 4 ? "destructive" : "outline"}>
                          {row.kmPerLitre.toFixed(2)} km/L
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record fuel entry</DialogTitle>
            <DialogDescription>Use this for pump refuels or a confirmed fuel loss.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ff-vehicle">Vehicle</Label>
              <Select value={logForm.vehicle_id} onValueChange={(v) => setLogForm({ ...logForm, vehicle_id: v })}>
                <SelectTrigger id="ff-vehicle"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ff-type">Entry type</Label>
              <Select value={logForm.event_type} onValueChange={(v) => setLogForm({ ...logForm, event_type: v })}>
                <SelectTrigger id="ff-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refuel">Refuel</SelectItem>
                  <SelectItem value="drain">Fuel loss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ff-litres">Litres</Label>
              <Input id="ff-litres" inputMode="decimal" value={logForm.litres}
                onChange={(e) => setLogForm({ ...logForm, litres: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ff-level">Tank level after (%)</Label>
              <Input id="ff-level" inputMode="numeric" value={logForm.level_pct}
                onChange={(e) => setLogForm({ ...logForm, level_pct: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ff-cost">Cost (GHS)</Label>
              <Input id="ff-cost" inputMode="decimal" value={logForm.cost_ghs}
                onChange={(e) => setLogForm({ ...logForm, cost_ghs: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ff-odo">Odometer (km)</Label>
              <Input id="ff-odo" inputMode="decimal" value={logForm.odometer_km}
                onChange={(e) => setLogForm({ ...logForm, odometer_km: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ff-notes">Notes</Label>
              <Input id="ff-notes" value={logForm.notes}
                onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button onClick={saveLog} disabled={saving}>{saving ? "Saving…" : "Record entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
