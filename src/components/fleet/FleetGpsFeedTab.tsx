/**
 * GPS FEED — connect real trackers and see why dashboard charts are empty.
 *
 * Step 1 registers vehicles (Vehicles tab), step 2 mints a tracker key here,
 * step 3 points the device or telematics gateway at the ingest endpoint. The
 * readiness table then shows live / stale / silent per vehicle, which is
 * exactly what drives the dashboard's uptime, fuel and geofence charts.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Satellite, KeyRound, Copy, Plus, Ban, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { vehicleLabel, type FleetVehicle } from "@/lib/fleet";
import {
  useFleetFeedReadiness, useIngestKeys, useCreateIngestKey, useSetIngestKeyActive,
  FEED_STATE_LABEL, FEED_STATE_TONE, FLEET_INGEST_URL,
} from "@/hooks/useFleetFeed";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
  isAdmin: boolean;
}

const ANY_VEHICLE = "__any__";
const errMessage = (e: unknown) => (e as { message?: string })?.message || "Something went wrong";

async function copy(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Clipboard unavailable — select and copy manually");
  }
}

export function FleetGpsFeedTab({ vehicles, canManage, isAdmin }: Props) {
  const readiness = useFleetFeedReadiness(canManage);
  const keys = useIngestKeys(canManage);
  const createKey = useCreateIngestKey();
  const setActive = useSetIngestKeyActive();

  const [mintOpen, setMintOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [vehicleId, setVehicleId] = useState(ANY_VEHICLE);
  const [minted, setMinted] = useState<{ label: string; api_key: string } | null>(null);

  const rows = readiness.data ?? [];
  const counts = useMemo(() => {
    const c = { live: 0, stale: 0, silent: 0, blocked: 0, noUnit: 0, noDriver: 0 };
    for (const r of rows) {
      if (r.feed_state === "live") c.live += 1;
      else if (r.feed_state === "stale") c.stale += 1;
      else if (r.feed_state === "silent" || r.feed_state === "never_reported") c.silent += 1;
      if (r.feed_state === "no_device" || r.feed_state === "no_key") c.blocked += 1;
      if (!r.org_unit_id) c.noUnit += 1;
      if (!r.driver_name) c.noDriver += 1;
    }
    return c;
  }, [rows]);

  const samplePayload = useMemo(
    () =>
      JSON.stringify(
        {
          positions: [
            {
              device_id: rows[0]?.device_id || "TRK-000123",
              lat: 5.7031,
              lng: -0.2934,
              recorded_at: new Date().toISOString(),
              speed_kph: 42,
              heading: 180,
              ignition: true,
              odometer_km: 128450,
              fuel_level_pct: 68,
              satellites: 11,
            },
          ],
        },
        null,
        2,
      ),
    [rows],
  );

  const curl = `curl -X POST '${FLEET_INGEST_URL}' \\
  -H 'content-type: application/json' \\
  -H 'x-fleet-key: YOUR_TRACKER_KEY' \\
  -d '${JSON.stringify({ positions: [{ device_id: rows[0]?.device_id || "TRK-000123", lat: 5.7031, lng: -0.2934, speed_kph: 42, ignition: true, fuel_level_pct: 68 }] })}'`;

  const mint = async () => {
    if (!label.trim()) {
      toast.error("Give the key a label, e.g. the tracker or gateway name");
      return;
    }
    try {
      const row = await createKey.mutateAsync({
        label: label.trim(),
        vehicle_id: vehicleId === ANY_VEHICLE ? null : vehicleId,
      });
      setMinted({ label: row.label, api_key: row.api_key });
      setMintOpen(false);
      setLabel("");
      setVehicleId(ANY_VEHICLE);
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          You do not have fleet management access.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Connection steps ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-primary" aria-hidden="true" />
            Connect a live GPS feed
          </CardTitle>
          <CardDescription>
            Dashboard uptime, fuel and geofence charts are built from tracker positions. Complete
            these four steps per vehicle and the charts fill in as data arrives.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <div>
                <span className="font-medium">Register the vehicle</span> on the Vehicles tab (or
                Bulk register for a CSV), setting its <span className="font-mono text-xs">Tracker device ID</span>,
                assigned unit and assigned driver.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <div>
                <span className="font-medium">Mint a tracker key</span> below — one per device, or a
                single gateway key covering the whole fleet. The key is shown once.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <div>
                <span className="font-medium">Point the device or telematics platform</span> at the
                ingest endpoint with the key in the <span className="font-mono text-xs">x-fleet-key</span> header.
                Positions may be batched up to 500 at a time.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">4</span>
              <div>
                <span className="font-medium">Watch the readiness table</span> below flip to “Live”.
                Geofence, speeding and fuel alerts then raise automatically, and Fleet Dashboard,
                Live map and Replay follow along in real time.
              </div>
            </li>
          </ol>

          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ingest endpoint</Label>
              <Button size="sm" variant="ghost" onClick={() => copy(FLEET_INGEST_URL, "Endpoint URL")}>
                <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Copy
              </Button>
            </div>
            <code className="block break-all font-mono text-xs">POST {FLEET_INGEST_URL}</code>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payload</Label>
                <Button size="sm" variant="ghost" onClick={() => copy(samplePayload, "Payload sample")}>
                  <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Copy
                </Button>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{samplePayload}</pre>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Test from a terminal</Label>
                <Button size="sm" variant="ghost" onClick={() => copy(curl, "Test command")}>
                  <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Copy
                </Button>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{curl}</pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tracker keys ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
              Tracker keys
            </CardTitle>
            <CardDescription>
              Only a hash is stored, so a key can never be read back — revoke and mint a new one if
              a device is lost. A key locked to a vehicle can only write that vehicle's positions.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => setMintOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Mint key
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {keys.isLoading && <p className="text-sm text-muted-foreground">Loading keys…</p>}
          {!keys.isLoading && (keys.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tracker keys yet{isAdmin ? " — mint one to start receiving positions." : "."}
            </p>
          )}
          {(keys.data ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>State</TableHead>
                    {isAdmin && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(keys.data ?? []).map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.label}</TableCell>
                      <TableCell className="text-sm">
                        {k.registration_number
                          ? `${k.registration_number}${k.call_sign ? ` · ${k.call_sign}` : ""}`
                          : "Whole fleet (gateway)"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(k.created_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={k.active
                            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                            : "border-destructive/40 text-destructive"}
                        >
                          {k.active ? "Active" : "Revoked"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setActive.isPending}
                            onClick={async () => {
                              try {
                                await setActive.mutateAsync({ id: k.id, active: !k.active });
                                toast.success(k.active ? "Key revoked" : "Key reactivated");
                              } catch (e) {
                                toast.error(errMessage(e));
                              }
                            }}
                          >
                            {k.active ? (
                              <><Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Revoke</>
                            ) : (
                              <><RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Reactivate</>
                            )}
                          </Button>
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

      {/* ── Readiness ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {counts.live > 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              : <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />}
            Feed readiness
          </CardTitle>
          <CardDescription>
            {counts.live} live · {counts.stale} stale · {counts.silent} not reporting ·{" "}
            {counts.blocked} missing a tracker ID or key · {counts.noUnit} without a unit ·{" "}
            {counts.noDriver} without a driver. Vehicles with no positions contribute nothing to the
            dashboard charts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readiness.isLoading && <p className="text-sm text-muted-foreground">Checking feeds…</p>}
          {!readiness.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No vehicles registered yet — add them on the Vehicles tab first.
            </p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Tracker ID</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Last position</TableHead>
                    <TableHead className="text-right">Fixes 24h</TableHead>
                    <TableHead className="text-right">Fuel 24h</TableHead>
                    <TableHead className="text-right">Geofence 7d</TableHead>
                    <TableHead>Feed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.vehicle_id}>
                      <TableCell className="font-medium">
                        {r.registration_number}
                        {r.call_sign && (
                          <span className="ml-2 text-xs text-muted-foreground">{r.call_sign}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.device_id || <span className="text-destructive">Not set</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.org_unit_name || <span className="text-destructive">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.driver_name || <span className="text-amber-700 dark:text-amber-300">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.last_position_at ? formatDateTime(r.last_position_at) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{r.positions_24h}</TableCell>
                      <TableCell className="text-right">{r.fuel_readings_24h}</TableCell>
                      <TableCell className="text-right">{r.geofence_events_7d}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FEED_STATE_TONE[r.feed_state]}>
                          {FEED_STATE_LABEL[r.feed_state]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Mint dialog ────────────────────────────────────────────────────── */}
      <Dialog open={mintOpen} onOpenChange={setMintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mint a tracker key</DialogTitle>
            <DialogDescription>
              The key is displayed once after creation. Store it in the tracker or telematics
              platform configuration — it cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="key-label">Label</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Teltonika FMB920 — GS-2101-26"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-vehicle">Scope</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="key-vehicle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VEHICLE}>Whole fleet (gateway key)</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A vehicle-scoped key is rejected if it reports any other vehicle — preferred for
                per-device installs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMintOpen(false)}>Cancel</Button>
            <Button onClick={mint} disabled={createKey.isPending}>
              {createKey.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Show-once key ──────────────────────────────────────────────────── */}
      <Dialog open={!!minted} onOpenChange={(o) => !o && setMinted(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tracker key created</DialogTitle>
            <DialogDescription>
              Copy it now — {minted?.label}. This is the only time it will be shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <code className="block break-all font-mono text-sm">{minted?.api_key}</code>
            <Button size="sm" variant="outline" onClick={() => minted && copy(minted.api_key, "Tracker key")}>
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Copy key
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send it as the <span className="font-mono">x-fleet-key</span> header on every POST to the
            ingest endpoint.
          </p>
          <DialogFooter>
            <Button onClick={() => setMinted(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
