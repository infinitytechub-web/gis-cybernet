/**
 * Today's attendance per profile, shared by the Staff Directory, Analytics
 * and exports so duty colours match the Duty Roster and Attendance screens.
 * Refreshes live whenever an attendance row changes.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dutyStateOf, type DutyState } from "@/components/shared/DutyStatusBadge";

export type TodayDuty = { status: string | null; check_in: string | null };

export const DUTY_LABEL: Record<DutyState, string> = {
  on_duty: "On duty", excused: "Excused", absent: "Absent", pending: "Not marked",
};

let channelCount = 0;

export function useTodayDuty() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const ch = supabase
      .channel(`today-duty-${++channelCount}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, () =>
        qc.invalidateQueries({ queryKey: ["today-duty"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  return useQuery({
    queryKey: ["today-duty", today],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendances").select("profile_id, status, check_in").eq("date", today).limit(5000);
      const m = new Map<string, TodayDuty>();
      for (const r of data ?? []) if (r.profile_id) m.set(r.profile_id, { status: r.status as string, check_in: r.check_in });
      return m;
    },
  });
}

/** Duty state for a profile; unmarked staff show "Not marked" (not assumed absent). */
export function dutyFor(map: Map<string, TodayDuty> | undefined, profileId: string): DutyState {
  const d = map?.get(profileId);
  return dutyStateOf(d?.status ?? null, d?.check_in ?? null, false);
}
