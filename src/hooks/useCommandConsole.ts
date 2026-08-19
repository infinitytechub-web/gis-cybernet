/**
 * COMMAND CONSOLE data services.
 *
 * Aggregates the live operational signals a Regional / Sector command needs on
 * one surface: fleet alerts, security & cyber incidents, operations, enforcement
 * activity and open detentions.
 *
 * Every feed row is tagged with the org unit it belongs to (the vehicle's
 * posting for fleet rows, the reporting officer's posting for everything else)
 * so the console can be scoped down the hierarchy. RLS remains the enforcement
 * point — this layer only decides what is presented.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { descendantIds, type OrgUnit } from "@/lib/org-hierarchy";

export type ConsoleSource =
  | "fleet"
  | "security"
  | "cyber"
  | "operations"
  | "enforcement"
  | "detention";

export const CONSOLE_SOURCE_LABELS: Record<ConsoleSource, string> = {
  fleet: "Fleet",
  security: "Security",
  cyber: "Cyber",
  operations: "Operations",
  enforcement: "Enforcement",
  detention: "Detention",
};

export type ConsoleSeverity = "critical" | "high" | "medium" | "low" | "info";

export const CONSOLE_SEVERITIES: ConsoleSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export interface ConsoleIncident {
  /** Unique across sources (`source:id`). */
  key: string;
  id: string;
  source: ConsoleSource;
  title: string;
  detail: string | null;
  severity: ConsoleSeverity;
  /** Raw status string from the owning module. */
  status: string;
  /** True while the item still needs command attention. */
  open: boolean;
  occurredAt: string;
  location: string | null;
  orgUnitId: string | null;
  /** In-app destination for the owning module. */
  href: string;
}

function severityOf(value: string | null | undefined): ConsoleSeverity {
  const v = (value ?? "").toLowerCase();
  if (["critical", "severe", "extreme", "panic"].includes(v)) return "critical";
  if (["high", "major", "warning"].includes(v)) return "high";
  if (["medium", "moderate"].includes(v)) return "medium";
  if (["low", "minor"].includes(v)) return "low";
  return "info";
}

const OPEN_STATUSES = new Set([
  "new",
  "open",
  "active",
  "acknowledged",
  "pending",
  "investigating",
  "in_progress",
  "ongoing",
  "planned",
  "escalated",
  "detained",
  "in_custody",
]);

function isOpen(status: string | null | undefined) {
  return OPEN_STATUSES.has((status ?? "").toLowerCase());
}

/** user_id → org_unit_id for tagging module rows to a command. */
function usePostingMap(enabled: boolean) {
  return useQuery({
    queryKey: ["command-console", "postings"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, org_unit_id");
      if (error) throw error;
      const map = new Map<string, string | null>();
      for (const row of data ?? []) {
        if (row.user_id) map.set(row.user_id, row.org_unit_id ?? null);
      }
      return map;
    },
  });
}

/**
 * Unified live feed. Polls every 20s so the console stays current without
 * holding open a realtime channel on tables that carry sensitive rows.
 */
export function useCommandConsoleFeed(enabled: boolean, days = 30) {
  const { user } = useAuth();
  const postingsQuery = usePostingMap(enabled && !!user);
  const postings = postingsQuery.data;

  const feedQuery = useQuery({
    queryKey: ["command-console", "feed", days],
    enabled: enabled && !!user && !!postings,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ConsoleIncident[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const unitOf = (id: string | null | undefined) =>
        (id && postings?.get(id)) ?? null;

      const [fleet, vehicles, security, cyber, ops, enf, detention] =
        await Promise.all([
          supabase
            .from("fleet_alerts")
            .select("id, alert_type, severity, status, message, occurred_at, vehicle_id")
            .gte("occurred_at", since)
            .order("occurred_at", { ascending: false })
            .limit(300),
          supabase.from("fleet_vehicles").select("id, registration_number, call_sign, org_unit_id"),
          supabase
            .from("security_incidents")
            .select("id, title, description, incident_type, severity, status, location, reported_by, created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(300),
          supabase
            .from("cyber_incidents")
            .select("id, incident_number, title, description, incident_type, severity, status, reported_by, reported_at")
            .gte("reported_at", since)
            .order("reported_at", { ascending: false })
            .limit(300),
          supabase
            .from("operations")
            .select("id, operation_type, description, severity, status, location, reported_by, operation_date, log_reference")
            .gte("operation_date", since.slice(0, 10))
            .order("operation_date", { ascending: false })
            .limit(300),
          supabase
            .from("enforcement_operations")
            .select("id, operation_type, description, severity, status, location, reported_by, operation_date, log_reference")
            .gte("operation_date", since.slice(0, 10))
            .order("operation_date", { ascending: false })
            .limit(300),
          supabase
            .from("detention_records")
            .select("id, first_name, last_name, crime_type, risk_level, status, location_of_arrest, created_by, intake_at")
            .gte("intake_at", since)
            .order("intake_at", { ascending: false })
            .limit(300),
        ]);

      const firstError = [fleet, vehicles, security, cyber, ops, enf, detention].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const vehicleById = new Map(
        (vehicles.data ?? []).map((v) => [v.id, v]),
      );

      const items: ConsoleIncident[] = [];

      for (const a of fleet.data ?? []) {
        const v = a.vehicle_id ? vehicleById.get(a.vehicle_id) : undefined;
        items.push({
          key: `fleet:${a.id}`,
          id: a.id,
          source: "fleet",
          title: `${a.alert_type.replace(/_/g, " ")}${v ? ` — ${v.call_sign || v.registration_number}` : ""}`,
          detail: a.message ?? null,
          severity: a.alert_type === "panic" ? "critical" : severityOf(a.severity),
          status: a.status,
          open: isOpen(a.status),
          occurredAt: a.occurred_at,
          location: null,
          orgUnitId: v?.org_unit_id ?? null,
          href: "/fleet",
        });
      }

      for (const s of security.data ?? []) {
        items.push({
          key: `security:${s.id}`,
          id: s.id,
          source: "security",
          title: s.title || s.incident_type || "Security incident",
          detail: s.description ?? null,
          severity: severityOf(s.severity),
          status: s.status,
          open: isOpen(s.status),
          occurredAt: s.created_at,
          location: s.location ?? null,
          orgUnitId: unitOf(s.reported_by),
          href: "/misd",
        });
      }

      for (const c of cyber.data ?? []) {
        items.push({
          key: `cyber:${c.id}`,
          id: c.id,
          source: "cyber",
          title: `${c.incident_number ? `${c.incident_number} — ` : ""}${c.title || c.incident_type || "Cyber incident"}`,
          detail: c.description ?? null,
          severity: severityOf(c.severity),
          status: c.status,
          open: isOpen(c.status),
          occurredAt: c.reported_at,
          location: null,
          orgUnitId: unitOf(c.reported_by),
          href: "/misd",
        });
      }

      for (const o of ops.data ?? []) {
        items.push({
          key: `operations:${o.id}`,
          id: o.id,
          source: "operations",
          title: `${o.log_reference ? `${o.log_reference} — ` : ""}${o.operation_type || "Operation"}`,
          detail: o.description ?? null,
          severity: severityOf(o.severity),
          status: o.status,
          open: isOpen(o.status),
          occurredAt: o.operation_date,
          location: o.location ?? null,
          orgUnitId: unitOf(o.reported_by),
          href: "/operations",
        });
      }

      for (const e of enf.data ?? []) {
        items.push({
          key: `enforcement:${e.id}`,
          id: e.id,
          source: "enforcement",
          title: `${e.log_reference ? `${e.log_reference} — ` : ""}${e.operation_type || "Enforcement action"}`,
          detail: e.description ?? null,
          severity: severityOf(e.severity),
          status: e.status,
          open: isOpen(e.status),
          occurredAt: e.operation_date,
          location: e.location ?? null,
          orgUnitId: unitOf(e.reported_by),
          href: "/enforcement",
        });
      }

      for (const d of detention.data ?? []) {
        items.push({
          key: `detention:${d.id}`,
          id: d.id,
          source: "detention",
          title: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "Detainee",
          detail: d.crime_type ?? null,
          severity: severityOf(d.risk_level),
          status: d.status,
          open: isOpen(d.status),
          occurredAt: d.intake_at,
          location: d.location_of_arrest ?? null,
          orgUnitId: unitOf(d.created_by),
          href: "/holding",
        });
      }

      return items.sort(
        (a, b) =>
          new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime(),
      );
    },
  });

  return {
    items: feedQuery.data ?? [],
    isLoading: postingsQuery.isLoading || feedQuery.isLoading,
    isFetching: feedQuery.isFetching,
    error: (postingsQuery.error ?? feedQuery.error) as Error | null,
    refetch: feedQuery.refetch,
    dataUpdatedAt: feedQuery.dataUpdatedAt,
  };
}

/** Filter a feed to one command branch (unit + everything beneath it). */
export function useBranchFilter(units: OrgUnit[], rootId: string | "all") {
  return useMemo(() => {
    if (rootId === "all") return null;
    return new Set(descendantIds(units, rootId));
  }, [units, rootId]);
}

export interface ConsoleStatusRow {
  orgUnitId: string | null;
  name: string;
  type: string;
  total: number;
  open: number;
  critical: number;
  bySource: Record<ConsoleSource, number>;
  latestAt: string | null;
  /** 0-100 readiness score: 100 = nothing outstanding. */
  readiness: number;
}

/** Roll a feed up per command node for the status dashboards. */
export function rollupByCommand(
  items: ConsoleIncident[],
  units: OrgUnit[],
  levels: OrgUnit["type"][],
): ConsoleStatusRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const nodes = units.filter((u) => levels.includes(u.type));

  const ancestorFor = (unitId: string | null): string | null => {
    let cur = unitId ? byId.get(unitId) : undefined;
    while (cur) {
      if (levels.includes(cur.type)) return cur.id;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return null;
  };

  const emptySources = (): Record<ConsoleSource, number> => ({
    fleet: 0, security: 0, cyber: 0, operations: 0, enforcement: 0, detention: 0,
  });

  const rows = new Map<string, ConsoleStatusRow>();
  for (const n of nodes) {
    rows.set(n.id, {
      orgUnitId: n.id, name: n.name, type: n.type,
      total: 0, open: 0, critical: 0, bySource: emptySources(),
      latestAt: null, readiness: 100,
    });
  }
  rows.set("unassigned", {
    orgUnitId: null, name: "Unattributed", type: "unit",
    total: 0, open: 0, critical: 0, bySource: emptySources(),
    latestAt: null, readiness: 100,
  });

  for (const item of items) {
    const key = ancestorFor(item.orgUnitId) ?? "unassigned";
    const row = rows.get(key);
    if (!row) continue;
    row.total += 1;
    row.bySource[item.source] += 1;
    if (item.open) row.open += 1;
    if (item.open && item.severity === "critical") row.critical += 1;
    if (item.occurredAt && (!row.latestAt || item.occurredAt > row.latestAt)) {
      row.latestAt = item.occurredAt;
    }
  }

  for (const row of rows.values()) {
    row.readiness = Math.max(0, 100 - row.open * 4 - row.critical * 12);
  }

  return [...rows.values()]
    .filter((r) => r.total > 0 || r.orgUnitId !== null)
    .sort((a, b) => b.critical - a.critical || b.open - a.open || a.name.localeCompare(b.name));
}
