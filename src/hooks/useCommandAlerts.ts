/**
 * COMMAND CONSOLE INBOX data services.
 *
 * Officer-raised command alerts: create, assign, progress, close. Every write
 * goes through a security-definer RPC so the authority check and the audit
 * trail entry happen in the same transaction — the client never writes the
 * trail itself (`command_alert_events` is immutable).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CommandAlertStatus = "new" | "assigned" | "in_progress" | "escalated" | "closed";
export type CommandAlertSeverity = "critical" | "high" | "medium" | "low" | "info";

export const COMMAND_ALERT_STATUSES: CommandAlertStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "escalated",
  "closed",
];

export const COMMAND_ALERT_STATUS_LABELS: Record<CommandAlertStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  escalated: "Escalated",
  closed: "Closed",
};

export const COMMAND_ALERT_SEVERITIES: CommandAlertSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export const COMMAND_ALERT_CATEGORIES = [
  "general",
  "operations",
  "security",
  "fleet",
  "detention",
  "personnel",
  "logistics",
  "cyber",
];

export interface CommandAlert {
  id: string;
  reference: string;
  title: string;
  detail: string | null;
  category: string;
  severity: CommandAlertSeverity;
  status: CommandAlertStatus;
  location: string | null;
  org_unit_id: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  due_at: string | null;
  closed_at: string | null;
  closing_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CommandAlertEvent {
  id: string;
  alert_id: string;
  action: string;
  from_status: CommandAlertStatus | null;
  to_status: CommandAlertStatus | null;
  assigned_to: string | null;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export const OPEN_COMMAND_ALERT_STATUSES: CommandAlertStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "escalated",
];

/** Inbox rows visible to the signed-in officer (RLS decides the reach). */
export function useCommandAlerts(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["command-alerts"],
    enabled: enabled && !!user,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CommandAlert[]> => {
      const { data, error } = await supabase
        .from("command_alerts")
        .select(
          "id, reference, title, detail, category, severity, status, location, org_unit_id, assigned_to, assigned_at, due_at, closed_at, closing_notes, created_by, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CommandAlert[];
    },
  });
}

/** Immutable audit trail for one alert. */
export function useCommandAlertTrail(alertId: string | null) {
  return useQuery({
    queryKey: ["command-alert-trail", alertId],
    enabled: !!alertId,
    queryFn: async (): Promise<CommandAlertEvent[]> => {
      const { data, error } = await supabase
        .from("command_alert_events")
        .select("id, alert_id, action, from_status, to_status, assigned_to, note, actor_id, created_at")
        .eq("alert_id", alertId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommandAlertEvent[];
    },
  });
}

/** user_id → display name, for assignee and actor columns. */
export function useStaffDirectoryLite(enabled = true) {
  return useQuery({
    queryKey: ["command-alerts", "staff-lite"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, staff_id, first_name, last_name, status, org_unit_id")
        .order("first_name");
      if (error) throw error;
      return (data ?? []).filter((r) => !!r.user_id) as {
        user_id: string;
        staff_id: string | null;
        first_name: string;
        last_name: string;
        status: string | null;
        org_unit_id: string | null;
      }[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (alertId?: string) => {
    qc.invalidateQueries({ queryKey: ["command-alerts"] });
    if (alertId) qc.invalidateQueries({ queryKey: ["command-alert-trail", alertId] });
  };
}

export function useCreateCommandAlert() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      detail?: string | null;
      severity: CommandAlertSeverity;
      category: string;
      org_unit_id?: string | null;
      location?: string | null;
      assigned_to?: string | null;
      due_at?: string | null;
      source_ref?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("command_alert_create", {
        _title: input.title,
        _detail: input.detail ?? null,
        _severity: input.severity,
        _category: input.category,
        _org_unit_id: input.org_unit_id ?? null,
        _location: input.location ?? null,
        _assigned_to: input.assigned_to ?? null,
        _due_at: input.due_at ?? null,
        _source_ref: input.source_ref ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useAssignCommandAlert() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { alertId: string; assignedTo: string; note?: string | null }) => {
      const { error } = await supabase.rpc("command_alert_assign", {
        _alert_id: input.alertId,
        _assigned_to: input.assignedTo,
        _note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.alertId),
  });
}

export function useSetCommandAlertStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { alertId: string; status: CommandAlertStatus; note?: string | null }) => {
      const { error } = await supabase.rpc("command_alert_set_status", {
        _alert_id: input.alertId,
        _status: input.status,
        _note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.alertId),
  });
}

export function useAddCommandAlertNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { alertId: string; note: string }) => {
      const { error } = await supabase.rpc("command_alert_add_note", {
        _alert_id: input.alertId,
        _note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.alertId),
  });
}
