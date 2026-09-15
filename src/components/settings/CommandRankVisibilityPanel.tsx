/**
 * Which ranks appear in each command dashboard.
 *
 * Administrators pick a command (or the service-wide default) and tick the ranks
 * whose figures should show in that dashboard's rank breakdown. A command's own
 * setting beats the service-wide default; anything untouched stays visible.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { sortRanks, type RankCategoryLike, type RankLike } from "@/lib/rank-order";

export const RANK_VISIBILITY_KEY = "command-rank-visibility";
const SERVICE_WIDE = "service-wide";

type VisibilityRow = {
  id: string;
  org_unit_id: string | null;
  rank_id: string;
  is_visible: boolean;
};

export function CommandRankVisibilityPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [unitId, setUnitId] = useState<string>(SERVICE_WIDE);
  const { data: units = [] } = useOrgUnits();

  const { data: categories = [] } = useQuery({
    queryKey: ["rank-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rank_categories").select("id, name, sort_order").order("sort_order");
      if (error) throw error;
      return (data ?? []) as RankCategoryLike[];
    },
  });

  const { data: ranks = [], isLoading } = useQuery({
    queryKey: ["ranks-hierarchy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranks").select("id, name, abbreviation, level, sort_order, category_id");
      if (error) throw error;
      return (data ?? []) as (RankLike & { abbreviation: string | null })[];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: [RANK_VISIBILITY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_rank_visibility").select("id, org_unit_id, rank_id, is_visible");
      if (error) throw error;
      return (data ?? []) as VisibilityRow[];
    },
  });

  const ordered = useMemo(() => sortRanks(ranks, categories), [ranks, categories]);
  const scopeUnit = unitId === SERVICE_WIDE ? null : unitId;

  const unitRow = (rankId: string) =>
    rows.find((r) => r.rank_id === rankId && r.org_unit_id === scopeUnit);
  const defaultRow = (rankId: string) =>
    rows.find((r) => r.rank_id === rankId && r.org_unit_id === null);

  /** Effective visibility: command setting, then service-wide default, else shown. */
  const isVisible = (rankId: string) =>
    unitRow(rankId)?.is_visible ?? defaultRow(rankId)?.is_visible ?? true;

  const setVisible = useMutation({
    mutationFn: async ({ rankId, visible }: { rankId: string; visible: boolean }) => {
      const existing = unitRow(rankId);
      if (existing) {
        const { error } = await supabase
          .from("command_rank_visibility").update({ is_visible: visible }).eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("command_rank_visibility")
        .insert({ org_unit_id: scopeUnit, rank_id: rankId, is_visible: visible });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RANK_VISIBILITY_KEY] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clearOverrides = useMutation({
    mutationFn: async () => {
      const ids = rows.filter((r) => r.org_unit_id === scopeUnit).map((r) => r.id);
      if (!ids.length) return;
      const { error } = await supabase.from("command_rank_visibility").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(scopeUnit ? "Command follows the service-wide setting again" : "Defaults cleared");
      queryClient.invalidateQueries({ queryKey: [RANK_VISIBILITY_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overrideCount = rows.filter((r) => r.org_unit_id === scopeUnit).length;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ranks shown in command dashboards
        </CardTitle>
        <CardDescription>
          Choose a command and switch off any rank whose figures should not appear in its
          dashboard. Commands without their own setting follow the service-wide list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="rank-visibility-unit">Command</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger id="rank-visibility-unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SERVICE_WIDE}>Service-wide default</SelectItem>
                {units
                  .filter((u) => u.is_active !== false)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={!overrideCount || clearOverrides.isPending}
              onClick={() => clearOverrides.mutate()}
            >
              {clearOverrides.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Reset this command
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading ranks…</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {ordered.map((r) => {
              const own = unitRow(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.name}
                      {r.abbreviation && (
                        <span className="ml-1 text-xs text-muted-foreground">({r.abbreviation})</span>
                      )}
                    </p>
                    {scopeUnit && !own && (
                      <p className="text-xs text-muted-foreground">Following service-wide setting</p>
                    )}
                  </div>
                  <Switch
                    checked={isVisible(r.id)}
                    disabled={!canEdit || setVisible.isPending}
                    aria-label={`Show ${r.name} in this dashboard`}
                    onCheckedChange={(v) => setVisible.mutate({ rankId: r.id, visible: v })}
                  />
                </div>
              );
            })}
            {!ordered.length && (
              <p className="py-4 text-center text-sm text-muted-foreground">No ranks defined yet.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CommandRankVisibilityPanel;
