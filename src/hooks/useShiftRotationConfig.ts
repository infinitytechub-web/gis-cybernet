import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { ShiftGroup } from "@/lib/shift-rotation";
import { SHIFT_GROUPS as DEFAULT_GROUPS } from "@/lib/shift-rotation";

const DEFAULT_ANCHOR_ISO = "2026-05-01";

export type RotationSource =
  | "db"
  | "default"
  | "override-role"
  | "override-department"
  | "schedule-org"
  | "schedule-department"
  | "schedule-role"
  | "schedule-staff"
  | "individual-override";

export interface RotationConfig {
  anchorDate: Date;
  anchorIso: string;
  pattern: string[];
  updatedAt: string | null;
  source: RotationSource;
  overrideScopeLabel?: string | null;
}

export interface RotationOverrideRow {
  id: string;
  scope_type: "role" | "department";
  scope_value: string;
  anchor_date: string;
  pattern: string[];
  enabled: boolean;
  notes: string | null;
  updated_at: string;
}

interface PublishedSchedule {
  id: string;
  name: string;
  anchor_date: string;
  pattern: string[];
  version: number;
  timezone: string | null;
}

interface ScheduleAssignment {
  id: string;
  schedule_id: string;
  scope_type: "org" | "department" | "role" | "staff";
  scope_value: string | null;
  start_date: string;
  end_date: string | null;
  priority: number;
}

interface IndividualOverride {
  id: string;
  override_date: string;
  group_letter: string;
  reason: string | null;
}

const FALLBACK: RotationConfig = {
  anchorDate: parseISO(DEFAULT_ANCHOR_ISO),
  anchorIso: DEFAULT_ANCHOR_ISO,
  pattern: [...DEFAULT_GROUPS],
  updatedAt: null,
  source: "default",
};

interface ScopeOptions {
  /** Caller-provided viewer scope so the hook can pick a matching override. */
  roles?: string[] | null;
  departmentId?: string | null;
  /** Profile id — required to resolve published schedule assignments / individual overrides. */
  profileId?: string | null;
}

/** Specificity rank — higher wins when multiple scoped assignments cover the same day. */
const SCOPE_RANK: Record<ScheduleAssignment["scope_type"], number> = {
  staff: 4,
  role: 3,
  department: 2,
  org: 1,
};

function patternGroupForDate(anchorIso: string, pattern: string[], date: Date): string {
  const a = parseISO(anchorIso);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const aUtc = new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()));
  const diff = differenceInCalendarDays(d, aUtc);
  const idx = ((diff % pattern.length) + pattern.length) % pattern.length;
  return pattern[idx];
}

/**
 * Reads the singleton rotation config + overrides + published schedules and
 * subscribes to realtime updates.
 *
 * Resolver precedence per date (when `profileId` is supplied):
 *   1. Individual override row in `shift_rotation_individual_overrides`
 *   2. Most-specific published schedule assignment (staff > role > department > org),
 *      breaking ties by higher `priority`, then later `start_date`.
 *      Org-wide assignments are skipped for excluded roles.
 *   3. Legacy `shift_rotation_overrides` (department > role) — see `config`.
 *   4. Legacy `shift_rotation_config` singleton.
 *   5. Hard-coded fallback (May 2026 anchor, A→B→C→D).
 */
export function useShiftRotationConfig(scope?: ScopeOptions) {
  const qc = useQueryClient();

  // ---------------------- Legacy singleton + overrides ----------------------
  const baseQuery = useQuery({
    queryKey: ["shift-rotation-config"],
    queryFn: async (): Promise<RotationConfig> => {
      // Read through a safe RPC: the underlying table is command-tier only.
      const { data, error } = await supabase.rpc("shift_rotation_public_config" as any);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as unknown as
        | { anchor_date: string; pattern: string[]; updated_at: string }
        | null;
      if (!row?.anchor_date || !row?.pattern?.length) return FALLBACK;
      return {
        anchorDate: parseISO(row.anchor_date),
        anchorIso: row.anchor_date,
        pattern: row.pattern,
        updatedAt: row.updated_at,
        source: "db",
      };
    },
    staleTime: 60_000,
  });

  const overridesQuery = useQuery({
    queryKey: ["shift-rotation-overrides"],
    queryFn: async (): Promise<RotationOverrideRow[]> => {
      // Notes are intentionally not returned by this RPC (command-tier only).
      const { data, error } = await supabase.rpc("shift_rotation_public_overrides" as any);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, notes: null })) as RotationOverrideRow[];
    },
    staleTime: 60_000,
  });


  // ---------------------- Phase-3: published schedules ----------------------
  const schedulesQuery = useQuery({
    queryKey: ["shift-rotation-schedules-published"],
    queryFn: async (): Promise<PublishedSchedule[]> => {
      const { data, error } = await supabase
        .from("shift_rotation_schedules" as any)
        .select("id, name, anchor_date, pattern, version, timezone, status")
        .eq("status", "published");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        anchor_date: r.anchor_date,
        pattern: r.pattern,
        version: r.version,
        timezone: r.timezone,
      }));
    },
    staleTime: 60_000,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["shift-rotation-assignments-all"],
    queryFn: async (): Promise<ScheduleAssignment[]> => {
      const { data, error } = await supabase
        .from("shift_rotation_assignments" as any)
        .select("id, schedule_id, scope_type, scope_value, start_date, end_date, priority");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduleAssignment[];
    },
    staleTime: 60_000,
  });

  const exclusionsQuery = useQuery({
    queryKey: ["shift-rotation-exclusions"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("shift_rotation_exclusions" as any)
        .select("role");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.role as string);
    },
    staleTime: 5 * 60_000,
  });

  const individualOverridesQuery = useQuery({
    queryKey: ["shift-rotation-individual-overrides", scope?.profileId ?? null],
    enabled: !!scope?.profileId,
    queryFn: async (): Promise<IndividualOverride[]> => {
      const { data, error } = await supabase
        .from("shift_rotation_individual_overrides" as any)
        .select("id, override_date, group_letter, reason")
        .eq("profile_id", scope!.profileId!);
      if (error) throw error;
      return (data ?? []) as unknown as IndividualOverride[];
    },
    staleTime: 60_000,
  });

  // ---------------------- Realtime subscriptions ----------------------
  useEffect(() => {
    const ch = supabase
      .channel("shift-rotation-config")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_config" }, () =>
        qc.invalidateQueries({ queryKey: ["shift-rotation-config"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_overrides" }, () =>
        qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_schedules" }, () =>
        qc.invalidateQueries({ queryKey: ["shift-rotation-schedules-published"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_assignments" }, () =>
        qc.invalidateQueries({ queryKey: ["shift-rotation-assignments-all"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_individual_overrides" }, () =>
        qc.invalidateQueries({ queryKey: ["shift-rotation-individual-overrides"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // ---------------------- Effective base config (legacy + role/dept overrides) ----------------------
  const baseCfg = baseQuery.data ?? FALLBACK;
  const allOverrides = overridesQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const exclusions = exclusionsQuery.data ?? [];
  const individualOverrides = individualOverridesQuery.data ?? [];

  const cfg: RotationConfig = useMemo(() => {
    if (!scope) return baseCfg;
    if (scope.departmentId) {
      const dep = allOverrides.find(
        (o) => o.enabled && o.scope_type === "department" && o.scope_value === scope.departmentId,
      );
      if (dep) {
        return {
          anchorDate: parseISO(dep.anchor_date),
          anchorIso: dep.anchor_date,
          pattern: dep.pattern,
          updatedAt: dep.updated_at,
          source: "override-department",
          overrideScopeLabel: "Department override",
        };
      }
    }
    if (scope.roles && scope.roles.length) {
      const roleOv = allOverrides.find(
        (o) => o.enabled && o.scope_type === "role" && scope.roles!.includes(o.scope_value),
      );
      if (roleOv) {
        return {
          anchorDate: parseISO(roleOv.anchor_date),
          anchorIso: roleOv.anchor_date,
          pattern: roleOv.pattern,
          updatedAt: roleOv.updated_at,
          source: "override-role",
          overrideScopeLabel: `Role override · ${roleOv.scope_value}`,
        };
      }
    }
    return baseCfg;
  }, [baseCfg, allOverrides, scope?.departmentId, scope?.roles?.join("|")]);

  // ---------------------- Resolver ----------------------
  const overrideMap = useMemo(() => {
    const m = new Map<string, IndividualOverride>();
    individualOverrides.forEach((o) => m.set(o.override_date, o));
    return m;
  }, [individualOverrides]);

  const scheduleById = useMemo(() => {
    const m = new Map<string, PublishedSchedule>();
    schedules.forEach((s) => m.set(s.id, s));
    return m;
  }, [schedules]);

  function findScheduleAssignment(date: Date): { assignment: ScheduleAssignment; schedule: PublishedSchedule } | null {
    if (!scope) return null;
    const iso = format(date, "yyyy-MM-dd");
    const profileId = scope.profileId ?? null;
    const departmentId = scope.departmentId ?? null;
    const roles = scope.roles ?? [];
    const orgExcluded = roles.some((r) => exclusions.includes(r));

    const matches: { a: ScheduleAssignment; s: PublishedSchedule }[] = [];
    for (const a of assignments) {
      if (iso < a.start_date) continue;
      if (a.end_date && iso > a.end_date) continue;
      const s = scheduleById.get(a.schedule_id);
      if (!s) continue; // schedule isn't published

      switch (a.scope_type) {
        case "staff":
          if (profileId && a.scope_value === profileId) matches.push({ a, s });
          break;
        case "role":
          if (a.scope_value && roles.includes(a.scope_value)) matches.push({ a, s });
          break;
        case "department":
          if (departmentId && a.scope_value === departmentId) matches.push({ a, s });
          break;
        case "org":
          if (!orgExcluded) matches.push({ a, s });
          break;
      }
    }
    if (!matches.length) return null;
    matches.sort((x, y) => {
      const r = SCOPE_RANK[y.a.scope_type] - SCOPE_RANK[x.a.scope_type];
      if (r !== 0) return r;
      if (y.a.priority !== x.a.priority) return y.a.priority - x.a.priority;
      return y.a.start_date.localeCompare(x.a.start_date);
    });
    return { assignment: matches[0].a, schedule: matches[0].s };
  }

  /**
   * Resolves the on-duty group letter for a given calendar date, applying the
   * full precedence chain (individual override → published schedule → legacy).
   */
  function groupForDate(date: Date): string {
    const iso = format(date, "yyyy-MM-dd");
    const ov = overrideMap.get(iso);
    if (ov) return ov.group_letter.toUpperCase();

    const found = findScheduleAssignment(date);
    if (found) {
      return patternGroupForDate(found.schedule.anchor_date, found.schedule.pattern, date);
    }
    return patternGroupForDate(cfg.anchorIso, cfg.pattern, date);
  }

  /** Returns the resolution source for the given date (for source badges). */
  function sourceForDate(date: Date): { source: RotationSource; label: string } {
    const iso = format(date, "yyyy-MM-dd");
    if (overrideMap.has(iso)) return { source: "individual-override", label: "Manual override" };
    const found = findScheduleAssignment(date);
    if (found) {
      const labelMap: Record<ScheduleAssignment["scope_type"], RotationSource> = {
        org: "schedule-org",
        department: "schedule-department",
        role: "schedule-role",
        staff: "schedule-staff",
      };
      return {
        source: labelMap[found.assignment.scope_type],
        label: `${found.schedule.name} v${found.schedule.version} (${found.assignment.scope_type})`,
      };
    }
    return { source: cfg.source, label: cfg.overrideScopeLabel ?? "Default rotation" };
  }

  function isOnDuty(date: Date, staffGroup: string | null | undefined): boolean {
    if (!staffGroup) return false;
    return groupForDate(date) === staffGroup.toUpperCase();
  }

  return {
    config: cfg,
    baseConfig: baseCfg,
    overrides: allOverrides,
    isLoading:
      baseQuery.isLoading ||
      overridesQuery.isLoading ||
      schedulesQuery.isLoading ||
      assignmentsQuery.isLoading,
    groupForDate,
    sourceForDate,
    isOnDuty,
    asShiftGroup: (g: string): ShiftGroup | string => g,
  };
}
