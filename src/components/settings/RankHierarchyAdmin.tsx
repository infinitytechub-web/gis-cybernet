/**
 * Rank editor: define ranks, group them into categories, set the top-to-bottom
 * order, and choose which ranks appear in each command dashboard.
 *
 * Every list of ranks in the system reads this order through
 * `src/lib/rank-order.ts`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { sortRanks, type RankCategoryLike, type RankLike } from "@/lib/rank-order";
import { CommandRankVisibilityPanel, RANK_VISIBILITY_KEY } from "./CommandRankVisibilityPanel";

type Rank = RankLike & { abbreviation: string | null };

type RankDraft = {
  id: string | null;
  name: string;
  abbreviation: string;
  categoryId: string | null;
};

const emptyDraft: RankDraft = { id: null, name: "", abbreviation: "", categoryId: null };

export function RankHierarchyAdmin({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [draft, setDraft] = useState<RankDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Rank | null>(null);

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

  const ordered = useMemo(() => sortRanks(ranks, categories), [ranks, categories]);
  const filtered = ordered.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || `${r.name} ${r.abbreviation ?? ""}`.toLowerCase().includes(q);
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ranks-hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["ranks"] });
    queryClient.invalidateQueries({ queryKey: ["rank-categories"] });
    queryClient.invalidateQueries({ queryKey: [RANK_VISIBILITY_KEY] });
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

  const saveRank = useMutation({
    mutationFn: async (d: RankDraft) => {
      const name = d.name.trim();
      const abbreviation = d.abbreviation.trim();
      if (!name) throw new Error("Enter the rank name");
      if (!abbreviation) throw new Error("Enter a short form for the rank");
      if (d.id) {
        const { error } = await supabase
          .from("ranks")
          .update({ name, abbreviation, category_id: d.categoryId })
          .eq("id", d.id);
        if (error) throw error;
        return;
      }
      // New ranks go to the bottom of the order.
      const nextOrder = ordered.length
        ? Math.max(...ordered.map((r) => r.sort_order ?? r.level ?? 0)) + 1
        : 1;
      const { error } = await supabase.from("ranks").insert({
        name,
        abbreviation,
        category_id: d.categoryId,
        level: nextOrder,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: (_data, d) => {
      toast.success(d.id ? "Rank updated" : "Rank added");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRank = useMutation({
    mutationFn: async (rank: Rank) => {
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("rank_id", rank.id);
      if (countError) throw countError;
      if (count) {
        throw new Error(`${count} officer(s) still hold this rank — move them first.`);
      }
      const { error } = await supabase.from("ranks").delete().eq("id", rank.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rank removed"); setPendingDelete(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (index: number, direction: -1 | 1) => {
    const a = filtered[index];
    const b = filtered[index + direction];
    if (!a || !b) return;
    swapOrder.mutate({ a, b });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" aria-hidden="true" />
            Ranks, categories &amp; hierarchy
          </CardTitle>
          <CardDescription>
            Ranks appear in this order, most senior first, everywhere in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search ranks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
                  <Plus className="mr-1 h-4 w-4" /> Add rank
                </Button>
                <Input
                  placeholder="New category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="sm:w-44"
                />
                <Button size="sm" variant="outline" disabled={addCategory.isPending} onClick={() => addCategory.mutate()}>
                  {addCategory.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Add category
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Edit rank"
                          onClick={() => setDraft({
                            id: r.id,
                            name: r.name,
                            abbreviation: r.abbreviation ?? "",
                            categoryId: r.category_id ?? null,
                          })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Remove rank"
                          onClick={() => setPendingDelete(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <p className="py-4 text-center text-sm text-muted-foreground">No ranks match that search.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CommandRankVisibilityPanel canEdit={canEdit} />

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit rank" : "Add rank"}</DialogTitle>
            <DialogDescription>
              New ranks start at the bottom of the order — use the arrows to place them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rank-name">Rank name</Label>
              <Input
                id="rank-name"
                value={draft?.name ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                placeholder="Assistant Superintendent"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rank-abbr">Short form</Label>
              <Input
                id="rank-abbr"
                value={draft?.abbreviation ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, abbreviation: e.target.value } : d))}
                placeholder="ASP"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rank-category">Category</Label>
              <Select
                value={draft?.categoryId ?? "none"}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, categoryId: v === "none" ? null : v } : d))}
              >
                <SelectTrigger id="rank-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Uncategorised —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button disabled={saveRank.isPending} onClick={() => draft && saveRank.mutate(draft)}>
              {saveRank.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              A rank can only be removed once no officer holds it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteRank.isPending}
              onClick={() => pendingDelete && deleteRank.mutate(pendingDelete)}
            >
              {deleteRank.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RankHierarchyAdmin;
