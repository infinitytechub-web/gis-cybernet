import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ShiftGroup } from "@/lib/shift-rotation";
import { SHIFT_GROUPS as DEFAULT_GROUPS } from "@/lib/shift-rotation";

const DEFAULT_ANCHOR_ISO = "2026-05-01";

export interface RotationConfig {
  anchorDate: Date;
  anchorIso: string;
  pattern: string[];
  updatedAt: string | null;
  source: "db" | "default" | "override-role" | "override-department";
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
}

/**
 * Reads the singleton rotation config + overrides and subscribes to realtime updates.
 * If `roles` / `departmentId` are provided, the most specific enabled override
 * (department > role) is used as the effective rotation for that viewer.
 */
export function useShiftRotationConfig(scope?: ScopeOptions) {
  const qc = useQueryClient();

  const baseQuery = useQuery({
    queryKey: ["shift-rotation-config"],
    queryFn: async (): Promise<RotationConfig> => {
      const { data, error } = await supabase
        .from("shift_rotation_config" as any)
        .select("anchor_date, pattern, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as unknown as { anchor_date: string; pattern: string[]; updated_at: string } | null;
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
      const { data, error } = await supabase
        .from("shift_rotation_overrides" as any)
        .select("id, scope_type, scope_value, anchor_date, pattern, enabled, notes, updated_at")
        .order("scope_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RotationOverrideRow[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("shift-rotation-config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_rotation_config" },
        () => qc.invalidateQueries({ queryKey: ["shift-rotation-config"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_rotation_overrides" },
        () => qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const baseCfg = baseQuery.data ?? FALLBACK;
  const allOverrides = overridesQuery.data ?? [];

  const cfg: RotationConfig = useMemo(() => {
    if (!scope) return baseCfg;
    // Department override wins over role override; both must be enabled.
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

  function groupForDate(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const a = new Date(Date.UTC(cfg.anchorDate.getFullYear(), cfg.anchorDate.getMonth(), cfg.anchorDate.getDate()));
    const diff = differenceInCalendarDays(d, a);
    const idx = ((diff % cfg.pattern.length) + cfg.pattern.length) % cfg.pattern.length;
    return cfg.pattern[idx];
  }

  function isOnDuty(date: Date, staffGroup: string | null | undefined): boolean {
    if (!staffGroup) return false;
    return groupForDate(date) === staffGroup.toUpperCase();
  }

  return {
    config: cfg,
    baseConfig: baseCfg,
    overrides: allOverrides,
    isLoading: baseQuery.isLoading || overridesQuery.isLoading,
    groupForDate,
    isOnDuty,
    asShiftGroup: (g: string): ShiftGroup | string => g,
  };
}
