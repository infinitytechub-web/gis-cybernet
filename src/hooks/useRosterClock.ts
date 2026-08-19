/**
 * ROSTER CLOCK — clock a staff member in or out straight from the staff roster.
 *
 * All the decision-making lives server-side in `roster_clock_action`: it checks
 * the caller may act for that officer (self, admin, OIC/2IC/staff officer, or
 * the officer's own supervisor), reads the effective attendance window (shift
 * start/end plus grace, from `get_effective_attendance_window`), marks the
 * attendance row `present` or `late`, and returns a late / early alert so the
 * UI can raise it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ClockAction = "check_in" | "check_out";

export interface ClockResult {
  attendance_id: string;
  profile_id: string;
  date: string;
  action: ClockAction;
  status: string;
  check_in: string | null;
  check_out: string | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number;
  late_minutes: number;
  early_minutes: number;
  on_behalf: boolean;
  /** "ok" | "late" | "early" */
  severity: string;
  alert: string | null;
}

export function useRosterClock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      profileId: string;
      action: ClockAction;
      notes?: string;
      /** Only used for the toast copy. */
      name?: string;
    }): Promise<ClockResult> => {
      const { data, error } = await supabase.rpc("roster_clock_action", {
        _profile_id: vars.profileId,
        _action: vars.action,
        _notes: vars.notes ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as ClockResult;
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["unit-dashboard"] });

      const who = vars.name ? `${vars.name}: ` : "";
      const time = (res.action === "check_in" ? res.check_in : res.check_out) ?? null;
      const stamp = time
        ? new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "";
      const verb = res.action === "check_in" ? "Clocked in" : "Clocked out";

      if (res.severity === "late") {
        toast.warning(`${who}${verb} at ${stamp}`, { description: res.alert ?? undefined });
      } else if (res.severity === "early") {
        toast.warning(`${who}${verb} at ${stamp}`, { description: res.alert ?? undefined });
      } else {
        toast.success(`${who}${verb} at ${stamp}`, {
          description: res.action === "check_in" ? "Marked present on today's attendance." : undefined,
        });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record attendance"),
  });
}
