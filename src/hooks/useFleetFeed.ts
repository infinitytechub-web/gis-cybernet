/**
 * FLEET GPS FEED onboarding data services.
 *
 * Two concerns:
 *  1. Tracker keys — minted server-side (`fleet_create_ingest_key`), which
 *     returns the plaintext key ONCE and stores only a SHA-256 hash. The list
 *     RPC never exposes the hash.
 *  2. Feed readiness — per-vehicle picture of device / unit / driver / last
 *     position so an empty Fleet Dashboard can explain itself.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IngestKey {
  id: string;
  label: string;
  vehicle_id: string | null;
  registration_number: string | null;
  call_sign: string | null;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export type FeedState = "no_device" | "no_key" | "never_reported" | "live" | "stale" | "silent";

export interface FeedReadiness {
  vehicle_id: string;
  registration_number: string;
  call_sign: string | null;
  status: string;
  device_id: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  driver_name: string | null;
  has_key: boolean;
  last_position_at: string | null;
  positions_24h: number;
  fuel_readings_24h: number;
  geofence_events_7d: number;
  feed_state: FeedState;
}

export const FEED_STATE_LABEL: Record<FeedState, string> = {
  no_device: "No tracker ID",
  no_key: "No tracker key",
  never_reported: "Never reported",
  live: "Live",
  stale: "Stale",
  silent: "Silent 24h+",
};

export const FEED_STATE_TONE: Record<FeedState, string> = {
  no_device: "border-destructive/40 text-destructive",
  no_key: "border-destructive/40 text-destructive",
  never_reported: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  live: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  stale: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  silent: "border-destructive/40 text-destructive",
};

/** The public ingest endpoint trackers POST to. */
export const FLEET_INGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fleet-ingest`;

export function useFleetFeedReadiness(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "feed-readiness"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FeedReadiness[]> => {
      const { data, error } = await supabase.rpc("fleet_feed_readiness");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        positions_24h: Number(r.positions_24h ?? 0),
        fuel_readings_24h: Number(r.fuel_readings_24h ?? 0),
        geofence_events_7d: Number(r.geofence_events_7d ?? 0),
      })) as FeedReadiness[];
    },
  });
}

export function useIngestKeys(enabled = true) {
  return useQuery({
    queryKey: ["fleet", "ingest-keys"],
    enabled,
    queryFn: async (): Promise<IngestKey[]> => {
      const { data, error } = await supabase.rpc("fleet_list_ingest_keys");
      if (error) throw error;
      return (data ?? []) as IngestKey[];
    },
  });
}

/** Mints a key; the plaintext is returned once and never stored client-side. */
export function useCreateIngestKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; vehicle_id?: string | null }) => {
      const { data, error } = await supabase.rpc("fleet_create_ingest_key", {
        _label: input.label,
        _vehicle_id: input.vehicle_id || null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { id: string; label: string; api_key: string; vehicle_id: string | null }
        | undefined;
      if (!row?.api_key) throw new Error("Key was created but not returned — please retry");
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "ingest-keys"] });
      qc.invalidateQueries({ queryKey: ["fleet", "feed-readiness"] });
    },
  });
}

export function useSetIngestKeyActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("fleet_set_ingest_key_active", {
        _id: input.id,
        _active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", "ingest-keys"] });
      qc.invalidateQueries({ queryKey: ["fleet", "feed-readiness"] });
    },
  });
}
