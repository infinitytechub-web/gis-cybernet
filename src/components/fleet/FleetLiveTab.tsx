/** Live tracking — map, vehicle list, track replay window and panic/SOS. */
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Radio, Siren, Gauge, Fuel } from "lucide-react";
import { FleetLiveMap } from "@/components/fleet/FleetLiveMap";
import { raisePanic, useVehicleTrack } from "@/hooks/useFleet";
import {
  MOTION_CLASSES, MOTION_LABELS, motionState, trackDistanceKm, vehicleLabel,
  type FleetGeofence, type FleetVehicle,
} from "@/lib/fleet";

interface Props {
  vehicles: FleetVehicle[];
  geofences: FleetGeofence[];
  focusVehicleId: string | null;
  onFocusVehicle: (id: string | null) => void;
}

export function FleetLiveTab({ vehicles, geofences, focusVehicleId, onFocusVehicle }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [trackHours, setTrackHours] = useState(0);
  const [panicFor, setPanicFor] = useState<FleetVehicle | null>(null);
  const [panicNote, setPanicNote] = useState("");
  const [busy, setBusy] = useState(false);

  const trackQuery = useVehicleTrack(trackHours > 0 ? focusVehicleId : null, trackHours || 1);
  const track = trackHours > 0 ? trackQuery.data ?? [] : [];

  const located = useMemo(
    () => vehicles.filter((v) => v.last_lat != null && v.last_lng != null),
    [vehicles],
  );

  const listed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? vehicles.filter((v) => vehicleLabel(v).toLowerCase().includes(term))
      : vehicles;
    const rank: Record<string, number> = { moving: 0, idle: 1, offline: 2 };
    return [...rows].sort((a, b) => rank[motionState(a)] - rank[motionState(b)]
      || a.registration_number.localeCompare(b.registration_number));
  }, [vehicles, search]);

  const trackKm = useMemo(
    () => trackDistanceKm(track.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [track],
  );

  const sendPanic = async () => {
    if (!panicFor) return;
    setBusy(true);
    try {
      await raisePanic(panicFor.id, panicNote.trim() || undefined);
      toast({
        title: "Panic / SOS raised",
        description: "Command has been alerted in real time.",
      });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
      setPanicFor(null);
      setPanicNote("");
    } catch (error: any) {
      toast({ title: "Could not raise the alert", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" aria-hidden="true" />
              Live tracking
            </CardTitle>
            <CardDescription>
              {located.length} of {vehicles.length} vehicle(s) reporting a position
              {trackHours > 0 && track.length > 1 && ` · track ${trackKm.toFixed(1)} km`}
            </CardDescription>
          </div>
          <Select value={String(trackHours)} onValueChange={(v) => setTrackHours(Number(v))}>
            <SelectTrigger className="w-48" aria-label="Track history window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Live positions only</SelectItem>
              <SelectItem value="1">Replay last hour</SelectItem>
              <SelectItem value="8">Replay last 8 hours</SelectItem>
              <SelectItem value="24">Replay last 24 hours</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <FleetLiveMap
            vehicles={located}
            geofences={geofences}
            track={track}
            focusVehicleId={focusVehicleId}
            onSelectVehicle={onFocusVehicle}
          />
          {trackHours > 0 && !focusVehicleId && (
            <p className="mt-2 text-sm text-muted-foreground">
              Select a vehicle to replay its route.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehicles</CardTitle>
          <CardDescription>Tap a vehicle to centre the map.</CardDescription>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicles"
            aria-label="Search vehicles"
            className="mt-2"
          />
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <ul className="divide-y divide-border">
              {listed.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">No vehicles found.</li>
              )}
              {listed.map((v) => {
                const state = motionState(v);
                const selected = focusVehicleId === v.id;
                return (
                  <li key={v.id} className={selected ? "bg-accent/50" : undefined}>
                    <div className="space-y-2 p-3">
                      <button
                        type="button"
                        onClick={() => onFocusVehicle(selected ? null : v.id)}
                        className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-pressed={selected}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{vehicleLabel(v)}</span>
                          <Badge variant="outline" className={MOTION_CLASSES[state]}>{MOTION_LABELS[state]}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Gauge className="h-3 w-3" aria-hidden="true" />
                            {v.last_speed_kph != null ? `${Math.round(Number(v.last_speed_kph))} km/h` : "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Fuel className="h-3 w-3" aria-hidden="true" />
                            {v.last_fuel_level_pct != null ? `${Math.round(Number(v.last_fuel_level_pct))}%` : "—"}
                          </span>
                          <span>
                            {v.last_seen_at
                              ? `${formatDistanceToNow(new Date(v.last_seen_at))} ago`
                              : "no report"}
                          </span>
                        </div>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => { setPanicFor(v); setPanicNote(""); }}
                      >
                        <Siren className="mr-1 h-4 w-4" aria-hidden="true" /> Panic / SOS
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={!!panicFor} onOpenChange={(o) => !o && setPanicFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Raise panic / SOS for {panicFor?.registration_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately alerts command with the vehicle's last known position and, if the browser
              allows it, this device's current location.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="panic-note">Brief detail (optional)</Label>
            <Input
              id="panic-note"
              value={panicNote}
              onChange={(e) => setPanicNote(e.target.value)}
              placeholder="Nature of the emergency"
              maxLength={200}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendPanic} disabled={busy}>
              {busy ? "Sending…" : "Raise SOS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
