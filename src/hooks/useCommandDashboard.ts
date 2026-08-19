/**
 * COMMAND DASHBOARD data service.
 *
 * One security-definer RPC (`command_dashboard`) returns the readiness picture
 * per command branch: today's staff attendance, vehicle readiness, fuel levels
 * and open alerts. The RPC resolves the caller's branch reach server-side, so
 * an officer posted to a sector never receives another command's numbers.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CommandBranchRollup {
  org_unit_id: string;
  name: string;
  unit_type: string;
  staff_total: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  vehicles_total: number;
  vehicles_active: number;
  vehicles_maintenance: number;
  vehicles_grounded: number;
  vehicles_immobilized: number;
  vehicles_offline: number;
  avg_fuel_pct: number | null;
  low_fuel: number;
  open_alerts: number;
  critical_alerts: number;
  open_fleet_alerts: number;
  open_cyber: number;
  cyber_total: number;
  /** Procurement activity raised by staff posted to this branch. */
  proc_total: number;
  proc_pending: number;
  proc_approved: number;
  proc_received: number;
  proc_rejected: number;
  proc_committed: number;
  proc_items_ordered: number;
  proc_items_received: number;
}

export interface CommandDashboard {
  as_of: string;
  day: string;
  days: number;
  branches: CommandBranchRollup[];
}

export function useCommandDashboard(days = 30, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["command-dashboard", days],
    enabled: enabled && !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CommandDashboard> => {
      const { data, error } = await supabase.rpc("command_dashboard", { _days: days });
      if (error) throw error;
      const raw = (data ?? {}) as Partial<CommandDashboard>;
      return {
        as_of: raw.as_of ?? new Date().toISOString(),
        day: raw.day ?? "",
        days: raw.days ?? days,
        branches: (raw.branches ?? []) as CommandBranchRollup[],
      };
    },
  });
}

/** Attendance rate for a branch, 0-100 (null when nobody is posted there). */
export function attendanceRate(b: CommandBranchRollup): number | null {
  if (!b.staff_total) return null;
  return Math.round(((b.present + b.late) / b.staff_total) * 100);
}

/** Vehicle readiness for a branch, 0-100 (null when no vehicles are posted). */
export function vehicleReadiness(b: CommandBranchRollup): number | null {
  if (!b.vehicles_total) return null;
  const ready = Math.max(0, b.vehicles_active - b.vehicles_immobilized - b.vehicles_offline);
  return Math.round((ready / b.vehicles_total) * 100);
}

export function totalOpenAlerts(b: CommandBranchRollup): number {
  return b.open_alerts + b.open_fleet_alerts + b.open_cyber;
}
