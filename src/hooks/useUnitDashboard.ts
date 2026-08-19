/**
 * Per-unit dashboard data service.
 *
 * All figures come from the `unit_dashboard` database function, which decides
 * what the signed-in user may see: staff may only request their own unit and
 * the units beneath it, command-tier officers and administrators may request
 * any unit. A request outside a user's reach is rejected by the database, so the
 * unit filter can never be used to widen access.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UnitDashboardStaff {
  id: string;
  full_name: string | null;
  staff_id: string | null;
  status: string | null;
  rank: string | null;
  department: string | null;
  unit_name: string | null;
}

export interface UnitDashboardDetainee {
  id: string;
  name: string;
  nationality: string | null;
  crime_type: string | null;
  status: string | null;
  intake_at: string | null;
  cell_number: string | null;
  risk_level: string | null;
}

export interface UnitDashboardCase {
  id: string;
  log_reference: string | null;
  operation_type: string | null;
  location: string | null;
  status: string | null;
  severity: string | null;
  operation_date: string | null;
  arrests_count: number | null;
}

export interface UnitDashboardVehicle {
  id: string;
  registration_number: string;
  call_sign: string | null;
  status: string | null;
  last_seen_at: string | null;
}

export interface UnitDashboardPatrol {
  id: string;
  patrol_reference: string;
  patrol_date: string;
  start_time: string | null;
  end_time: string | null;
  district_name: string | null;
  patrol_type: string | null;
  status: string | null;
  personnel_count: number | null;
  incidents_count: number | null;
  incidents: string | null;
  leader_name: string | null;
}

export interface UnitDashboardData {
  unit: { id: string; name: string; code: string | null; type: string | null };
  unit_ids: string[];
  staff: UnitDashboardStaff[];
  staff_total: number;
  staff_active: number;
  detainees: UnitDashboardDetainee[];
  detainees_in_custody: number;
  cases: UnitDashboardCase[];
  cases_open: number;
  vehicles: UnitDashboardVehicle[];
  patrols: UnitDashboardPatrol[];
  patrols_recent: number;
  patrol_incidents_recent: number;
}

export function useUnitDashboard(orgUnitId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["unit-dashboard", orgUnitId],
    enabled: !!user && !!orgUnitId,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async (): Promise<UnitDashboardData> => {
      const { data, error } = await supabase.rpc("unit_dashboard", {
        _org_unit_id: orgUnitId!,
      });
      if (error) throw error;
      return data as unknown as UnitDashboardData;
    },
  });
}
