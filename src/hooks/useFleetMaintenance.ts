/**
 * FLEET MAINTENANCE data services — service logs, odometer readings and the
 * preventive-maintenance schedule.
 *
 * Reads are open to any signed-in user; writes are gated by RLS to
 * `can_manage_fleet()` (command tier, special duties, or the fleet capability
 * grant). Logging a completed service pushes the vehicle's odometer forward and
 * refreshes the matching schedule via the `fleet_maintenance_apply` trigger, so
 * the client never has to keep those in sync itself.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const SERVICE_TYPES = [
  "Engine oil & filter",
  "Major service",
  "Minor service",
  "Tyres",
  "Brakes",
  "Battery",
  "Roadworthy / inspection",
  "Body repair",
  "Other",
] as const;

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  schedule_id: string | null;
  service_type: string;
  service_date: string;
  odometer_km: number | null;
  cost: number | null;
  workshop: string | null;
  parts_replaced: string | null;
  downtime_days: number | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MaintenanceSchedule {
  id: string;
  vehicle_id: string;
  service_type: string;
  interval_km: number | null;
  interval_days: number | null;
  last_service_odometer_km: number | null;
  last_service_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface MaintenanceStatusRow {
  vehicle_id: string;
  registration_number: string;
  call_sign: string | null;
  org_unit_name: string | null;
  odometer_km: number | null;
  service_type: string | null;
  interval_km: number | null;
  interval_days: number | null;
  last_service_date: string | null;
  last_service_odometer_km: number | null;
  next_due_km: number | null;
  next_due_date: string | null;
  km_remaining: number | null;
  days_remaining: number | null;
  /** "overdue" | "due_soon" | "ok" | "unscheduled" */
  due_state: string;
  services_12m: number;
  cost_12m: number;
  downtime_12m: number;
}

const REC_COLS =
  "id, vehicle_id, schedule_id, service_type, service_date, odometer_km, cost, workshop, parts_replaced, downtime_days, status, notes, created_by, created_at";
const SCH_COLS =
  "id, vehicle_id, service_type, interval_km, interval_days, last_service_odometer_km, last_service_date, is_active, notes, created_at";

export function useMaintenanceRecords(days = 365) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fleet-maintenance", "records", days],
    enabled: !!user,
    queryFn: async (): Promise<MaintenanceRecord[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("fleet_maintenance_records")
        .select(REC_COLS)
        .gte("service_date", since)
        .order("service_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MaintenanceRecord[];
    },
  });
}

export function useMaintenanceSchedules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fleet-maintenance", "schedules"],
    enabled: !!user,
    queryFn: async (): Promise<MaintenanceSchedule[]> => {
      const { data, error } = await supabase
        .from("fleet_maintenance_schedules")
        .select(SCH_COLS)
        .order("service_type");
      if (error) throw error;
      return (data ?? []) as MaintenanceSchedule[];
    },
  });
}

/** Rolled-up due/overdue picture per vehicle — also used by the Fleet Dashboard. */
export function useMaintenanceStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fleet-maintenance", "status"],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async (): Promise<MaintenanceStatusRow[]> => {
      const { data, error } = await supabase.rpc("fleet_maintenance_status");
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceStatusRow[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["fleet-maintenance"] });
  qc.invalidateQueries({ queryKey: ["fleet"] });
}

export function useSaveMaintenanceRecord() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<MaintenanceRecord> & { vehicle_id: string; service_type: string }) => {
      const payload = {
        vehicle_id: input.vehicle_id,
        schedule_id: input.schedule_id ?? null,
        service_type: input.service_type,
        service_date: input.service_date ?? new Date().toISOString().slice(0, 10),
        odometer_km: input.odometer_km ?? null,
        cost: input.cost ?? null,
        workshop: input.workshop ?? null,
        parts_replaced: input.parts_replaced ?? null,
        downtime_days: input.downtime_days ?? null,
        status: input.status ?? "completed",
        notes: input.notes ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from("fleet_maintenance_records").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("fleet_maintenance_records")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      invalidate(qc);
      toast.success("Service log saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the service log"),
  });
}

export function useDeleteMaintenanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fleet_maintenance_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc);
      toast.success("Service log removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the service log"),
  });
}

export function useSaveMaintenanceSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      input: Partial<MaintenanceSchedule> & { vehicle_id: string; service_type: string },
    ) => {
      const payload = {
        vehicle_id: input.vehicle_id,
        service_type: input.service_type,
        interval_km: input.interval_km ?? null,
        interval_days: input.interval_days ?? null,
        last_service_odometer_km: input.last_service_odometer_km ?? null,
        last_service_date: input.last_service_date ?? null,
        is_active: input.is_active ?? true,
        notes: input.notes ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from("fleet_maintenance_schedules").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { error } = await supabase
        .from("fleet_maintenance_schedules")
        .upsert({ ...payload, created_by: user?.id ?? null }, { onConflict: "vehicle_id,service_type" });
      if (error) throw error;
      return null;
    },
    onSuccess: () => {
      invalidate(qc);
      toast.success("Maintenance schedule saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the schedule"),
  });
}

export function useDeleteMaintenanceSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fleet_maintenance_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc);
      toast.success("Schedule removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the schedule"),
  });
}

export const DUE_TONE: Record<string, string> = {
  overdue: "border-destructive/50 text-destructive",
  due_soon: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  ok: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  unscheduled: "text-muted-foreground",
};

export const DUE_LABEL: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  ok: "On schedule",
  unscheduled: "No schedule",
};
