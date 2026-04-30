import { useEffect } from "react";
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
  source: "db" | "default";
}

const FALLBACK: RotationConfig = {
  anchorDate: parseISO(DEFAULT_ANCHOR_ISO),
  anchorIso: DEFAULT_ANCHOR_ISO,
  pattern: [...DEFAULT_GROUPS],
  updatedAt: null,
  source: "default",
};

/** Reads the singleton rotation config and subscribes to realtime updates. */
export function useShiftRotationConfig() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["shift-rotation-config"],
    queryFn: async (): Promise<RotationConfig> => {
      const { data, error } = await supabase
        .from("shift_rotation_config" as any)
        .select("anchor_date, pattern, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as { anchor_date: string; pattern: string[]; updated_at: string } | null;
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

  useEffect(() => {
    const ch = supabase
      .channel("shift-rotation-config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_rotation_config" },
        () => qc.invalidateQueries({ queryKey: ["shift-rotation-config"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const cfg = query.data ?? FALLBACK;

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
    isLoading: query.isLoading,
    groupForDate,
    isOnDuty,
    // Convenience for typed grouping in components
    asShiftGroup: (g: string): ShiftGroup | string => g,
  };
}
