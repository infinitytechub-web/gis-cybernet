/**
 * HISTORICAL ROUTE REPLAY.
 *
 * Plays back a vehicle's recorded GPS track: the map draws the full route while
 * a ghost marker walks the timeline, and the readout shows speed, ignition and
 * the door / boot sensor state captured at that exact ping.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pause, Play, RotateCcw, DoorOpen, Package, KeyRound, Gauge } from "lucide-react";
import { FleetLiveMap } from "@/components/fleet/FleetLiveMap";
import { useVehicleTrack } from "@/hooks/useFleet";
import { vehicleLabel, type FleetGeofence, type FleetVehicle } from "@/lib/fleet";
import { formatDateTime } from "@/lib/date-format";

const WINDOWS = [
  { value: "2", label: "Last 2 hours" },
  { value: "6", label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
];

const SPEEDS = [1, 2, 4, 8];

interface FleetReplayTabProps {
  vehicles: FleetVehicle[];
  geofences?: FleetGeofence[];
  initialVehicleId?: string | null;
}

export function FleetReplayTab({ vehicles, geofences = [], initialVehicleId }: FleetReplayTabProps) {
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId ?? null);
  const [hours, setHours] = useState("24");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!vehicleId && vehicles.length > 0) setVehicleId(vehicles[0].id);
  }, [vehicleId, vehicles]);

  const trackQuery = useVehicleTrack(vehicleId, Number(hours));
  const points = useMemo(
    () => (trackQuery.data ?? []).filter((p) => p.lat != null && p.lng != null),
    [trackQuery.data],
  );

  // Restart the timeline whenever the source data changes.
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [vehicleId, hours]);

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (!playing || points.length < 2) return;
    timerRef.current = window.setInterval(() => {
      setIndex((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(60, 600 / speed));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, speed, points.length]);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const current = points[Math.min(index, Math.max(points.length - 1, 0))] ?? null;

  /** The map takes a vehicle list — feed it a snapshot pinned to the replay ping. */
  const replayVehicles = useMemo<FleetVehicle[]>(() => {
    if (!vehicle) return [];
    if (!current) return [vehicle];
    return [{
      ...vehicle,
      last_lat: current.lat,
      last_lng: current.lng,
      last_speed_kph: current.speed_kph,
      last_heading: current.heading,
      last_ignition: current.ignition,
      last_fuel_level_pct: current.fuel_level_pct ?? vehicle.last_fuel_level_pct,
      last_seen_at: current.recorded_at,
    }];
  }, [vehicle, current]);

  const sensorOpen = (value: boolean | null | undefined) => value === true;

  const doorEvents = points.filter((p, i) => p.door_open === true && points[i - 1]?.door_open !== true).length;
  const bootEvents = points.filter((p, i) => p.boot_open === true && points[i - 1]?.boot_open !== true).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Route replay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="replay-vehicle">Vehicle</label>
              <Select value={vehicleId ?? undefined} onValueChange={setVehicleId}>
                <SelectTrigger id="replay-vehicle" aria-label="Replay vehicle"><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="replay-window">Time window</label>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger id="replay-window" aria-label="Replay time window"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={points.length < 2}
                aria-label={playing ? "Pause replay" : "Play replay"}
              >
                {playing ? <Pause className="mr-1 h-4 w-4" aria-hidden="true" /> : <Play className="mr-1 h-4 w-4" aria-hidden="true" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setIndex(0); setPlaying(false); }} aria-label="Restart replay">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-end gap-1">
              {SPEEDS.map((s) => (
                <Button key={s} type="button" size="sm" variant={speed === s ? "default" : "outline"} onClick={() => setSpeed(s)}>
                  {s}×
                </Button>
              ))}
            </div>
          </div>

          {trackQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : points.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              No recorded positions for this vehicle in the selected window.
            </p>
          ) : (
            <>
              <Slider
                value={[index]}
                min={0}
                max={points.length - 1}
                step={1}
                onValueChange={(v) => { setIndex(v[0]); setPlaying(false); }}
                aria-label="Replay position"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{formatDateTime(current?.recorded_at)}</Badge>
                <Badge variant="outline">
                  <Gauge className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {current?.speed_kph != null ? `${Math.round(Number(current.speed_kph))} km/h` : "—"}
                </Badge>
                <Badge variant="outline">
                  <KeyRound className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Ignition {current?.ignition ? "on" : "off"}
                </Badge>
                <Badge
                  variant="outline"
                  className={sensorOpen(current?.door_open) ? "border-destructive/40 bg-destructive/10 text-destructive" : undefined}
                >
                  <DoorOpen className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Door {current?.door_open == null ? "—" : sensorOpen(current.door_open) ? "open" : "closed"}
                </Badge>
                <Badge
                  variant="outline"
                  className={sensorOpen(current?.boot_open) ? "border-destructive/40 bg-destructive/10 text-destructive" : undefined}
                >
                  <Package className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Boot {current?.boot_open == null ? "—" : sensorOpen(current.boot_open) ? "open" : "closed"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Ping {index + 1} of {points.length} · {doorEvents} door opening{doorEvents === 1 ? "" : "s"} · {bootEvents} boot opening{bootEvents === 1 ? "" : "s"} in window
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <FleetLiveMap
        vehicles={replayVehicles}
        geofences={geofences}
        track={points}
        focusVehicleId={vehicleId}
        height={480}
      />
    </div>
  );
}
