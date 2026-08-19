/**
 * PATROL PLAN data services.
 *
 * Plans are the forward-looking counterpart of the patrol log: officers create a
 * plan (district, time window, vehicle, strength), command tier assigns it to an
 * officer, and it is closed with an outcome once executed. Rows are scoped by
 * RLS to the signed-in officer's unit branch (command tier reaches their whole
 * branch) or to plans assigned to them. The Fleet Dashboard reads the same rows
 * to show planned/active patrols per vehicle.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const PLAN_STATUSES = ["draft", "assigned", "active", "completed", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_TYPES = [
  "routine",
  "snap_check",
  "border_patrol",
  "escort",
  "night_patrol",
  "joint_operation",
  "surveillance",
  "other",
] as const;

export interface PatrolPlan {
  id: string;
  plan_reference: string;
  title: string;
  objective: string | null;
  planned_date: string;
  start_time: string;
  end_time: string | null;
  district_id: string | null;
  district_name: string | null;
  org_unit_id: string | null;
  patrol_type: string;
  vehicle_id: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  personnel_count: number;
  route_summary: string | null;
  status: string;
  outcome: string | null;
  closure_notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  patrol_log_id: string | null;
  created_by: string;
  created_at: string;
}

const SELECT_COLS =
  "id, plan_reference, title, objective, planned_date, start_time, end_time, district_id, district_name, org_unit_id, patrol_type, vehicle_id, assigned_to, assigned_by, assigned_at, personnel_count, route_summary, status, outcome, closure_notes, closed_by, closed_at, patrol_log_id, created_by, created_at";

export function isPlanOpen(status: string) {
  return ["draft", "assigned", "active"].includes((status ?? "").toLowerCase());
}

export function usePatrolPlans(days = 90, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patrol-plans", days],
    enabled: enabled && !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PatrolPlan[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("patrol_plans")
        .select(SELECT_COLS)
        .gte("planned_date", since)
        .order("planned_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PatrolPlan[];
    },
  });
}

export interface PatrolPlanInput {
  title: string;
  objective?: string | null;
  planned_date: string;
  start_time: string;
  end_time?: string | null;
  district_id?: string | null;
  org_unit_id?: string | null;
  patrol_type: string;
  vehicle_id?: string | null;
  assigned_to?: string | null;
  personnel_count: number;
  route_summary?: string | null;
  status: PlanStatus;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["patrol-plans"] });
  qc.invalidateQueries({ queryKey: ["fleet-dashboard"] });
  qc.invalidateQueries({ queryKey: ["unit-dashboard"] });
}

export function useCreatePatrolPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: PatrolPlanInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("patrol_plans")
        .insert({
          title: input.title,
          objective: input.objective || null,
          planned_date: input.planned_date,
          start_time: input.start_time,
          end_time: input.end_time || null,
          district_id: input.district_id || null,
          org_unit_id: input.org_unit_id || null,
          patrol_type: input.patrol_type,
          vehicle_id: input.vehicle_id || null,
          assigned_to: input.assigned_to || null,
          assigned_by: input.assigned_to ? user.id : null,
          assigned_at: input.assigned_to ? new Date().toISOString() : null,
          personnel_count: input.personnel_count ?? 0,
          route_summary: input.route_summary || null,
          status: input.status,
          created_by: user.id,
        })
        .select("id, plan_reference")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdatePatrolPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<PatrolPlanInput>) => {
      const { id, ...patch } = input;
      const row = {
        ...patch,
        ...(patch.assigned_to
          ? { assigned_by: user?.id ?? null, assigned_at: new Date().toISOString() }
          : {}),
      };
      const { error } = await supabase.from("patrol_plans").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Assign a plan to an officer (moves draft → assigned). */
export function useAssignPatrolPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string }) => {
      const { error } = await supabase
        .from("patrol_plans")
        .update({
          assigned_to: assignedTo,
          assigned_by: user?.id ?? null,
          assigned_at: new Date().toISOString(),
          status: "assigned",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Close a plan out: completed or cancelled, with an outcome note. */
export function useClosePatrolPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      outcome,
      notes,
    }: { id: string; status: "completed" | "cancelled"; outcome?: string; notes?: string }) => {
      const { error } = await supabase
        .from("patrol_plans")
        .update({
          status,
          outcome: outcome || null,
          closure_notes: notes || null,
          closed_by: user?.id ?? null,
          closed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Mark an assigned plan as under way. */
export function useStartPatrolPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patrol_plans").update({ status: "active" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeletePatrolPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patrol_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
