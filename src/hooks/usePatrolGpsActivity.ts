/**
 * PATROL ↔ GPS ACTIVITY.
 *
 * Joins the patrol log to live GPS tracking: for every patrol in the window the
 * `patrol_gps_activity` reporting service replays the assigned vehicle's
 * positions inside the patrol's own date/time window, resolves which Ghana
 * districts the trail actually crossed and reports the real first/last GPS
 * times. The Fleet Dashboard uses it to show the district and time a patrol was
 * genuinely on the ground, and to flag logs the GPS trail does not confirm.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PatrolGpsMatch = "confirmed" | "mismatch" | "no_gps" | "no_vehicle";

export interface PatrolGpsActivityRow {
  id: string;
  patrol_reference: string;
  patrol_date: string;
  start_time: string | null;
  end_time: string | null;
  patrol_type: string;
  status: string;
  incidents_count: number;
  personnel_count: number;
  logged_district: string | null;
  vehicle_id: string | null;
  registration_number: string | null;
  call_sign: string | null;
  win_start: string | null;
  win_end: string | null;
  fix_count: number;
  first_fix: string | null;
  last_fix: string | null;
  max_speed_kph: number;
  distance_km: number;
  gps_districts: string[];
  gps_district_ids: string[];
  gps_match: PatrolGpsMatch;
}

export interface PatrolGpsActivity {
  days: number;
  as_of: string;
  patrols: PatrolGpsActivityRow[];
}

export const PATROL_GPS_MATCH_LABELS: Record<PatrolGpsMatch, string> = {
  confirmed: "GPS confirmed",
  mismatch: "District mismatch",
  no_gps: "No GPS fixes",
  no_vehicle: "Foot patrol",
};

/** Reads patrol entries enriched with the districts and times their GPS trail proves. */
export function usePatrolGpsActivity(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patrol-gps-activity", days, user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<PatrolGpsActivity> => {
      const { data, error } = await supabase.rpc("patrol_gps_activity", { _days: Number(days) });
      if (error) throw error;
      const payload = (data ?? {}) as Partial<PatrolGpsActivity>;
      return {
        days: payload.days ?? days,
        as_of: payload.as_of ?? new Date().toISOString(),
        patrols: (payload.patrols ?? []) as PatrolGpsActivityRow[],
      };
    },
  });
}
