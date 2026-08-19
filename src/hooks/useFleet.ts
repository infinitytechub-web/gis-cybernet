/**
 * Real-time fleet data services.
 *
 * `fleet_vehicles` and `fleet_alerts` are in the realtime publication, so
 * position updates (written by the tracker ingest endpoint) and new alerts push
 * straight into the React Query cache. A slow poll runs alongside as a safety
 * net for flaky field connectivity.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ALERT_TYPE_LABELS,
  type FleetAlert,
  type FleetFuelReading,
  type FleetGeofence,
  type FleetPosition,
  type FleetVehicle,
} from "@/lib/fleet";

const LIVE_POLL_MS = 20_000;

export function useFleetVehicles(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "vehicles"],
    enabled,
    refetchInterval: LIVE_POLL_MS,
    queryFn: async (): Promise<FleetVehicle[]> => {
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("*")
        .order("registration_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type GhanaDistrict = {
  id: string;
  name: string;
  code: string;
  region: string;
  category: string;
  centroid_lat: number;
  centroid_lng: number;
};

/** Reference register of every Ghanaian district (official ADM2 boundaries). */
export function useGhanaDistricts(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "ghana-districts"],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<GhanaDistrict[]> => {
      const { data, error } = await supabase
        .from("ghana_districts")
        .select("id, name, code, region, category, centroid_lat, centroid_lng")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Copies official district boundaries into the live geofence register. */
export function useActivateDistrictZones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (districtIds: string[]) => {
      const { data, error } = await supabase.rpc("fleet_activate_district_zones", {
        _district_ids: districtIds,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast({
        title: `${count} district patrol area${count === 1 ? "" : "s"} activated`,
        description: "Zone entry and exit is now tracked for these districts.",
      });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    },
    onError: (error: any) =>
      toast({
        title: "Could not activate district patrol areas",
        description: error?.message,
        variant: "destructive",
      }),
  });
}

export function useDeactivateDistrictZones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ districtIds, remove }: { districtIds: string[]; remove?: boolean }) => {
      const { data, error } = await supabase.rpc("fleet_deactivate_district_zones", {
        _district_ids: districtIds,
        _delete: remove ?? false,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast({ title: `${count} district patrol area${count === 1 ? "" : "s"} removed` });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    },
    onError: (error: any) =>
      toast({
        title: "Could not update district patrol areas",
        description: error?.message,
        variant: "destructive",
      }),
  });
}

export function useFleetGeofences(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "geofences"],
    enabled,
    queryFn: async (): Promise<FleetGeofence[]> => {
      const { data, error } = await supabase
        .from("fleet_geofences")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFleetAlerts(status: "open" | "all", enabled = true) {
  return useQuery({
    queryKey: ["fleet", "alerts", status],
    enabled,
    refetchInterval: LIVE_POLL_MS,
    queryFn: async (): Promise<FleetAlert[]> => {
      let q = supabase
        .from("fleet_alerts")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (status === "open") q = q.in("status", ["new", "acknowledged"]);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Track history for one vehicle over a time window (hours). */
export function useVehicleTrack(vehicleId: string | null, hours: number) {
  return useQuery({
    queryKey: ["fleet", "track", vehicleId, hours],
    enabled: !!vehicleId,
    queryFn: async (): Promise<FleetPosition[]> => {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("fleet_positions")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFleetFuel(vehicleId: string | "all", days: number, enabled = true) {
  return useQuery({
    queryKey: ["fleet", "fuel", vehicleId, days],
    enabled,
    queryFn: async (): Promise<FleetFuelReading[]> => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      let q = supabase
        .from("fleet_fuel_readings")
        .select("*")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(3000);
      if (vehicleId !== "all") q = q.eq("vehicle_id", vehicleId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFleetSummary(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "summary"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fleet_summary");
      if (error) throw error;
      return (data ?? {}) as Record<string, number | null>;
    },
  });
}

/**
 * Subscribes to live vehicle/alert changes. Vehicle rows update on every
 * position (the trigger refreshes last-known state), so the live map follows
 * trackers without polling. Critical alerts raise a toast immediately.
 */
export function useFleetRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const seenAlerts = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("fleet-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_vehicles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["fleet", "vehicles"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_alerts" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["fleet", "alerts"] });
          queryClient.invalidateQueries({ queryKey: ["fleet", "summary"] });
          const row = payload.new as FleetAlert | null;
          if (payload.eventType !== "INSERT" || !row?.id) return;
          if (seenAlerts.current.has(row.id)) return;
          seenAlerts.current.add(row.id);
          if (row.severity === "critical") {
            toast({
              title: `${ALERT_TYPE_LABELS[row.alert_type]} — immediate attention`,
              description: row.message,
              variant: "destructive",
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

/** Vehicles that currently have a valid fix, for map rendering. */
export function useLocatedVehicles(vehicles: FleetVehicle[] | undefined) {
  return useMemo(
    () => (vehicles ?? []).filter((v) => v.last_lat != null && v.last_lng != null),
    [vehicles],
  );
}

export async function raisePanic(vehicleId: string, note?: string) {
  const coords = await currentCoords();
  const { data, error } = await supabase.rpc("fleet_raise_panic", {
    _vehicle_id: vehicleId,
    _lat: coords?.lat ?? undefined,
    _lng: coords?.lng ?? undefined,
    _note: note ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function setAlertStatus(
  alertId: string,
  status: FleetAlert["status"],
  notes?: string,
) {
  const { error } = await supabase.rpc("fleet_set_alert_status", {
    _alert_id: alertId,
    _status: status,
    _notes: notes ?? undefined,
  });
  if (error) throw error;
}

/** Best-effort device location for a panic press — never blocks the alert. */
function currentCoords(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (value: { lat: number; lng: number } | null) => resolve(value);
    const timer = window.setTimeout(() => done(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        done(null);
      },
      { timeout: 4000, maximumAge: 30_000 },
    );
  });
}
