/**
 * CYBER INCIDENT MODULE data services.
 *
 * Threat type, source, impact and resolution for cyber events. Rows are
 * branch-scoped by RLS (`command_reach_units`), so the list an officer sees is
 * already limited to their own command — the client does no filtering for
 * security, only for presentation.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const CYBER_THREAT_TYPES = [
  "phishing",
  "malware",
  "ransomware",
  "internet_fraud",
  "identity_theft",
  "data_breach",
  "account_compromise",
  "denial_of_service",
  "insider_misuse",
  "document_forgery",
  "other",
] as const;

export const CYBER_SOURCES = [
  "external_actor",
  "internal_staff",
  "third_party_vendor",
  "public_report",
  "automated_detection",
  "partner_agency",
  "unknown",
] as const;

export const CYBER_IMPACT_LEVELS = [
  "none",
  "limited",
  "moderate",
  "significant",
  "severe",
  "unknown",
] as const;

export const CYBER_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export const CYBER_STATUSES = [
  "new",
  "investigating",
  "contained",
  "resolved",
  "closed",
] as const;

export type CyberStatus = (typeof CYBER_STATUSES)[number];

export interface CyberIncident {
  id: string;
  incident_number: string;
  title: string;
  description: string | null;
  incident_type: string;
  severity: string;
  status: string;
  source: string | null;
  threat_source: string | null;
  impact_level: string;
  impact_assessment: string | null;
  affected_systems: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  org_unit_id: string | null;
  reported_by: string;
  assigned_to: string | null;
  reported_at: string;
  detected_at: string | null;
}

const SELECT_COLS =
  "id, incident_number, title, description, incident_type, severity, status, source, threat_source, impact_level, impact_assessment, affected_systems, resolution_notes, resolved_at, resolved_by, org_unit_id, reported_by, assigned_to, reported_at, detected_at";

export function isCyberOpen(status: string) {
  return !["resolved", "closed"].includes((status ?? "").toLowerCase());
}

export function useCyberIncidents(days = 90, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cyber-incidents", days],
    enabled: enabled && !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CyberIncident[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("cyber_incidents")
        .select(SELECT_COLS)
        .gte("reported_at", since)
        .order("reported_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CyberIncident[];
    },
  });
}

export interface CyberIncidentInput {
  title: string;
  description?: string | null;
  incident_type: string;
  severity: string;
  status: CyberStatus;
  threat_source?: string | null;
  impact_level: string;
  impact_assessment?: string | null;
  affected_systems?: string | null;
  resolution_notes?: string | null;
  org_unit_id?: string | null;
  assigned_to?: string | null;
  detected_at?: string | null;
}

export function useCreateCyberIncident() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CyberIncidentInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("cyber_incidents")
        .insert({
          title: input.title,
          description: input.description ?? null,
          incident_type: input.incident_type,
          severity: input.severity,
          status: input.status,
          // `source` is the legacy column; keep both in step for reporting.
          source: input.threat_source ?? null,
          threat_source: input.threat_source ?? null,
          impact_level: input.impact_level,
          impact_assessment: input.impact_assessment ?? null,
          affected_systems: input.affected_systems ?? null,
          resolution_notes: input.resolution_notes ?? null,
          org_unit_id: input.org_unit_id ?? null,
          assigned_to: input.assigned_to ?? null,
          detected_at: input.detected_at ?? null,
          reported_by: user.id,
        })
        .select("id, incident_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cyber-incidents"] });
      qc.invalidateQueries({ queryKey: ["command-dashboard"] });
      qc.invalidateQueries({ queryKey: ["command-console"] });
    },
  });
}

export function useUpdateCyberIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<CyberIncidentInput>) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if ("threat_source" in rest) patch.source = rest.threat_source ?? null;
      const { error } = await supabase.from("cyber_incidents").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cyber-incidents"] });
      qc.invalidateQueries({ queryKey: ["command-dashboard"] });
      qc.invalidateQueries({ queryKey: ["command-console"] });
    },
  });
}
