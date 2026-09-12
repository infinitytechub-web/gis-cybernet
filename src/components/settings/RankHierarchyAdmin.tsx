/**
 * Rank categorisation and top-to-bottom hierarchy.
 *
 * Administrators group ranks into categories (Senior Officers, Junior Officers,
 * Civilian Staff, …) and set the order within each. Every list of ranks in the
 * system reads this order through `src/lib/rank-order.ts`.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { sortRanks, type RankCategoryLike, type RankLike } from "@/lib/rank-order";

type Rank = RankLike & { abbreviation: string | null };

export function RankHierarchyAdmin({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["rank-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rank_categories")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RankCategoryLike[];
    },
  });

  const { data: ranks = [], isLoading } = useQuery({
    queryKey: ["ranks-hierarchy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranks")
        .select("id, name, abbreviation, level, sort_order, category_id");
      if (error) throw error;
      return (data ?? []) as Rank[];
    },
  });

  const ordered = sortRanks(ranks, categories);
  const filtered = ordered.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || `${r.name} ${r.abbreviation ?? ""}`.toLowerCase().includes(q);
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ranks-hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["ranks"] });
    queryClient.invalidateQueries({ queryKey: ["rank-categories"] });
  };

  const setCategory = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string | null }) => {
      const { error } = await supabase.from("ranks").update({ category_id: categoryId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const swapOrder = useMutation({
    mutationFn: async ({ a, b }: { a: Rank; b: Rank }) => {
      const orderA = a.sort_order ?? a.level ?? 0;
      const orderB = b.sort_order ?? b.level ?? 0;
      const { error: e1 } = await supabase.from("ranks").update({ sort_order: orderB }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ranks").update({ sort_order: orderA }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      if (!newCategory.trim()) throw new Error("Enter a category name");
      const { error } = await supabase.from("rank_categories").insert({
        name: newCategory.trim(),
        sort_order: (categories.at(-1)?.sort_order ?? categories.length) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setNewCategory(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (index: number, direction: -1 | 1) => {
    const a = filtered[index];
    const b = filtered[index + direction];
    if (!a || !b) return;
    swapOrder.mutate({ a, b });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" aria-hidden="true" />
          Rank categories &amp; hierarchy
        </CardTitle>
        <CardDescription>
          Ranks appear in this order, most senior first, everywhere in the system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search ranks…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Input
                placeholder="New category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="sm:w-48"
              />
              <Button size="sm" variant="outline" disabled={addCategory.isPending} onClick={() => addCategory.mutate()}>
                {addCategory.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading ranks…</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {filtered.map((r, i) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">{i + 1}</Badge>
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  {r.abbreviation && (
                    <span className="text-xs text-muted-foreground">({r.abbreviation})</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={r.category_id ?? "none"}
                    onValueChange={(v) => setCategory.mutate({ id: r.id, categoryId: v === "none" ? null : v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Uncategorised —</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Move down" disabled={i === filtered.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RankHierarchyAdmin;
