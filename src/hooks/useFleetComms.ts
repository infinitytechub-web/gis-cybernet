/**
 * FLEET COMMS — in-cab two-way messaging, remote immobilisation and the demo feed.
 *
 * Messaging is real time in both directions: drivers write `driver_to_command`
 * rows for the vehicle they are assigned to, command writes `command_to_driver`
 * rows. Both sides are authorised in the database (RLS + `fleet_send_message`),
 * so the UI never decides who may talk to a cab.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { FleetVehicle } from "@/lib/fleet";

export type FleetMessage = Tables<"fleet_messages">;
export type FleetImmobilizerCommand = Tables<"fleet_immobilizer_commands">;
export type MessageDirection = "driver_to_command" | "command_to_driver";
export type MessagePriority = "normal" | "urgent" | "emergency";

export const MESSAGE_PRIORITY_LABELS: Record<MessagePriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
  emergency: "Emergency",
};

export const MESSAGE_PRIORITY_CLASSES: Record<MessagePriority, string> = {
  normal: "bg-muted text-muted-foreground border-border",
  urgent: "bg-warning/15 text-warning-foreground border-warning/30",
  emergency: "bg-destructive/15 text-destructive border-destructive/30",
};

const COMMS_POLL_MS = 20_000;

/** Message thread for one vehicle, or the whole fleet when `vehicleId` is "all". */
export function useFleetMessages(vehicleId: string | "all" | null, enabled = true) {
  return useQuery({
    queryKey: ["fleet", "messages", vehicleId],
    enabled: enabled && !!vehicleId,
    refetchInterval: COMMS_POLL_MS,
    queryFn: async (): Promise<FleetMessage[]> => {
      let q = supabase
        .from("fleet_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (vehicleId && vehicleId !== "all") q = q.eq("vehicle_id", vehicleId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImmobilizerLog(vehicleId: string | "all" | null, enabled = true) {
  return useQuery({
    queryKey: ["fleet", "immobilizer-log", vehicleId],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FleetImmobilizerCommand[]> => {
      let q = supabase
        .from("fleet_immobilizer_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (vehicleId && vehicleId !== "all") q = q.eq("vehicle_id", vehicleId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The vehicle the signed-in staff member drives, if any (drives the in-cab page). */
export function useMyVehicle() {
  return useQuery({
    queryKey: ["fleet", "my-vehicle"],
    queryFn: async (): Promise<FleetVehicle | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("*")
        .eq("assigned_driver_id", profile.id)
        .order("registration_number")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Push new in-cab traffic into the cache as it lands. */
export function useFleetMessagesRealtime(enabled = true) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("fleet-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["fleet", "messages"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

export async function sendFleetMessage(params: {
  vehicleId: string;
  body: string;
  direction: MessageDirection;
  priority?: MessagePriority;
  lat?: number | null;
  lng?: number | null;
}) {
  const { data, error } = await supabase.rpc("fleet_send_message", {
    _vehicle_id: params.vehicleId,
    _body: params.body,
    _direction: params.direction,
    _priority: params.priority ?? "normal",
    _lat: params.lat ?? undefined,
    _lng: params.lng ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function markMessagesRead(vehicleId: string, direction?: MessageDirection) {
  const { data, error } = await supabase.rpc("fleet_mark_messages_read", {
    _vehicle_id: vehicleId,
    _direction: direction ?? undefined,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

/** Remote lock / unlock. The database enforces authority, reason and speed limits. */
export async function setImmobilizer(vehicleId: string, lock: boolean, reason: string) {
  const { data, error } = await supabase.rpc("fleet_set_immobilizer", {
    _vehicle_id: vehicleId,
    _lock: lock,
    _reason: reason,
  });
  if (error) throw error;
  return data as string;
}

export type DemoEvent = "drive" | "speeding" | "fuel_drop" | "stop" | "door" | "boot";

export async function demoTick(event: DemoEvent = "drive", vehicleId?: string) {
  const { data, error } = await supabase.rpc("fleet_demo_tick", {
    _vehicle_id: vehicleId ?? undefined,
    _event: event,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export function unreadFor(messages: FleetMessage[], direction: MessageDirection) {
  return messages.filter((m) => m.direction === direction && !m.read_at).length;
}
