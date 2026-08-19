/**
 * DEMO GPS FEED — drives the training vehicle so the live map, alerting and fuel
 * monitoring can be walked through without a real tracker in the field.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlaskConical, Navigation, Gauge, Fuel, Square, DoorOpen, PackageOpen, Siren } from "lucide-react";
import { demoTick, type DemoEvent } from "@/hooks/useFleetComms";
import { raisePanic } from "@/hooks/useFleet";
import { vehicleLabel, type FleetVehicle } from "@/lib/fleet";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
  onFocusVehicle?: (id: string) => void;
}

const EVENTS: { event: DemoEvent; label: string; icon: any }[] = [
  { event: "drive", label: "Drive ping", icon: Navigation },
  { event: "speeding", label: "Speeding", icon: Gauge },
  { event: "fuel_drop", label: "Fuel drop", icon: Fuel },
  { event: "stop", label: "Stop", icon: Square },
  { event: "door", label: "Door open", icon: DoorOpen },
  { event: "boot", label: "Boot open", icon: PackageOpen },
];

export function FleetDemoFeed({ vehicles, canManage, onFocusVehicle }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const demo = vehicles.find((v) => v.is_demo);

  if (!canManage || !demo) return null;

  const run = async (event: DemoEvent) => {
    setBusy(event);
    try {
      const result = await demoTick(event, demo.id);
      toast({
        title: `Demo ping sent — ${event.replace("_", " ")}`,
        description: `${Math.round(Number(result.speed_kph ?? 0))} km/h · fuel ${Math.round(Number(result.fuel_level_pct ?? 0))}%`,
      });
      onFocusVehicle?.(demo.id);
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Demo feed failed", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const panic = async () => {
    setBusy("panic");
    try {
      await raisePanic(demo.id, "Demo walkthrough — training SOS");
      toast({ title: "Demo SOS raised", description: "Check the Alerts tab and Session Management trail." });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Could not raise the demo SOS", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
          Demo feed
          <Badge variant="outline">{vehicleLabel(demo)}</Badge>
        </CardTitle>
        <CardDescription>
          Training vehicle only. Each ping writes a real position, so geofence, speeding, fuel and sensor
          alerts fire exactly as they would in the field.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {EVENTS.map(({ event, label, icon: Icon }) => (
          <Button key={event} size="sm" variant="outline" disabled={!!busy} onClick={() => run(event)}>
            <Icon className="mr-1 h-4 w-4" aria-hidden="true" />
            {busy === event ? "Sending…" : label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!!busy}
          onClick={panic}
        >
          <Siren className="mr-1 h-4 w-4" aria-hidden="true" />
          {busy === "panic" ? "Sending…" : "Demo SOS"}
        </Button>
      </CardContent>
    </Card>
  );
}
