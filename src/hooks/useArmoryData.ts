import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ArmoryContext, ArmoryRecord } from "@/lib/armory";

export type ArmoryUnit = { id: string; name: string; type: string | null; parent_id: string | null };

/** Caller-scoped armory context, all visible records (paged) and command types, with live refresh. */
export function useArmoryData(channel: string) {
  const { user } = useAuth();
  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const ctx = ctxQ.data ?? { commands: [], staff: [] };
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && !!ctx.commands.length, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  const ids = ctx.commands.map(c => c.id);
  const unitsQ = useQuery({ queryKey: ["armory-units", ids.join(",")], enabled: ids.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("org_units").select("id,name,type,parent_id").in("id", ids); if (error) throw error; return (data ?? []) as unknown as ArmoryUnit[]; } });
  useEffect(() => {
    const ch = supabase.channel(channel).on("postgres_changes", { event: "*", schema: "public", table: "armory_records" }, () => { void recQ.refetch(); }).subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
  return { ctxQ, ctx, recQ, records: recQ.data ?? [], units: unitsQ.data ?? [], refetch: () => { void ctxQ.refetch(); void recQ.refetch(); } };
}
