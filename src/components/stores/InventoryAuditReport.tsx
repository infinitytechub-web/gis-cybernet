import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExportMenu } from "@/components/ui/export-menu";
import { ClipboardCheck, AlertTriangle, Plus, CheckCircle2, MinusCircle, PlusCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { InventoryAlertSettings } from "./InventoryAlertSettings";
import { InventoryAlertOverrides } from "./InventoryAlertOverrides";
import { InventoryThresholdAuditTrail } from "./InventoryThresholdAuditTrail";
import { InventoryAuditScheduler } from "./InventoryAuditScheduler";

export function InventoryAuditReport() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canCount = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");
  const [filter, setFilter] = useState<"mismatched" | "all" | "uncounted">("mismatched");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", physical_count: 0, notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items", "audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, asset_tag, name, qty_on_hand, unit, unit_cost, location, condition, inventory_categories(name)")
        .order("name");
      return data ?? [];
    },
  });

  const { data: counts = [] } = useQuery({
    queryKey: ["inventory_audit_counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_audit_counts")
        .select("id, item_id, physical_count, system_qty, variance, notes, counted_at, counted_by")
        .order("counted_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  // Latest count per item
  const latestPerItem = useMemo(() => {
    const m = new Map<string, any>();
    counts.forEach((c: any) => {
      if (!m.has(c.item_id)) m.set(c.item_id, c);
    });
    return m;
  }, [counts]);

  const rows = useMemo(() => {
    return items.map((i: any) => {
      const last = latestPerItem.get(i.id);
      const sysQty = Number(i.qty_on_hand);
      const phys = last ? Number(last.physical_count) : null;
      const variance = phys === null ? null : phys - sysQty;
      const value = sysQty * Number(i.unit_cost ?? 0);
      const varianceValue = variance === null ? null : variance * Number(i.unit_cost ?? 0);
      return { ...i, _sys: sysQty, _phys: phys, _variance: variance, _value: value, _varianceValue: varianceValue, _last: last };
    });
  }, [items, latestPerItem]);

  const filtered = useMemo(() => {
    return rows.filter((r: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!`${r.name} ${r.asset_tag ?? ""} ${r.location ?? ""}`.toLowerCase().includes(s)) return false;
      }
      if (filter === "mismatched") return r._variance !== null && r._variance !== 0;
      if (filter === "uncounted") return r._variance === null;
      return true;
    });
  }, [rows, search, filter]);

  const stats = useMemo(() => {
    const counted = rows.filter((r: any) => r._variance !== null);
    const mismatched = counted.filter((r: any) => r._variance !== 0);
    const shortageValue = counted
      .filter((r: any) => (r._varianceValue ?? 0) < 0)
      .reduce((s: number, r: any) => s + Math.abs(r._varianceValue), 0);
    const surplusValue = counted
      .filter((r: any) => (r._varianceValue ?? 0) > 0)
      .reduce((s: number, r: any) => s + r._varianceValue, 0);
    return {
      total: rows.length,
      counted: counted.length,
      uncounted: rows.length - counted.length,
      mismatched: mismatched.length,
      shortageValue,
      surplusValue,
    };
  }, [rows]);

  const recordCount = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Item required");
      const item = items.find((i: any) => i.id === form.item_id);
      if (!item) throw new Error("Item not found");
      const { error } = await supabase.from("inventory_audit_counts").insert({
        item_id: form.item_id,
        physical_count: Number(form.physical_count),
        system_qty: Number(item.qty_on_hand),
        notes: form.notes || null,
        counted_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_audit_counts"] });
      setOpen(false);
      setForm({ item_id: "", physical_count: 0, notes: "" });
      toast.success("Audit count recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportRows = filtered.map((r: any) => [
    r.asset_tag ?? "—",
    r.name,
    r.inventory_categories?.name ?? "—",
    r.location ?? "—",
    `${r._sys} ${r.unit}`,
    r._phys === null ? "Not counted" : `${r._phys} ${r.unit}`,
    r._variance === null ? "—" : (r._variance > 0 ? `+${r._variance}` : `${r._variance}`),
    r._varianceValue === null ? "—" : `₵${r._varianceValue.toFixed(2)}`,
    r._last ? format(new Date(r._last.counted_at), "yyyy-MM-dd") : "—",
  ]);

  return (
    <div className="space-y-4">
      <InventoryAlertSettings />
      <InventoryAlertOverrides />
      <InventoryThresholdAuditTrail />
      <InventoryAuditScheduler />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Tracked" value={stats.total} />
        <Tile label="Counted" value={stats.counted} accent="text-emerald-600" />
        <Tile label="Uncounted" value={stats.uncounted} accent="text-muted-foreground" />
        <Tile label="Mismatched" value={stats.mismatched} accent="text-amber-700" />
        <Tile
          label="Net variance"
          value={`₵${(stats.surplusValue - stats.shortageValue).toFixed(0)}`}
          accent={stats.shortageValue > stats.surplusValue ? "text-destructive" : "text-emerald-600"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-600" /> Inventory audit
              </CardTitle>
              <CardDescription>
                Compare physical counts against system on-hand quantities. Mismatches highlight stock that needs investigation.
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <ExportMenu
                getData={() => ({
                  title: "Inventory Audit Report",
                  filename: `inventory-audit-${format(new Date(), "yyyy-MM-dd")}`,
                  subtitle: `Filter: ${filter} · Generated ${format(new Date(), "PPpp")}`,
                  headers: ["Asset Tag", "Item", "Category", "Location", "System Qty", "Physical Count", "Variance", "Variance Value", "Last Counted"],
                  rows: exportRows,
                })}
              />
              {canCount && (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Record count</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Record physical count</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Item *</Label>
                        <Select value={form.item_id} onValueChange={v => setForm(p => ({ ...p, item_id: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {items.map((i: any) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name} {i.asset_tag ? `(${i.asset_tag})` : ""} — sys: {Number(i.qty_on_hand)} {i.unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Physical count *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={form.physical_count}
                          onChange={e => setForm(p => ({ ...p, physical_count: Number(e.target.value) }))}
                        />
                        {form.item_id && (() => {
                          const it = items.find((i: any) => i.id === form.item_id);
                          if (!it) return null;
                          const v = Number(form.physical_count) - Number(it.qty_on_hand);
                          return (
                            <div className="text-xs mt-1">
                              Variance: <span className={v === 0 ? "text-emerald-600" : v < 0 ? "text-destructive" : "text-amber-700"}>
                                {v === 0 ? "match" : v > 0 ? `+${v}` : v} {it.unit}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Reason / explanation (e.g. damaged, miscount)" />
                      </div>
                      <Button onClick={() => recordCount.mutate()} disabled={recordCount.isPending} className="w-full">
                        {recordCount.isPending ? "Saving…" : "Save count"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Input placeholder="Search item, tag or location…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mismatched">Mismatched only</SelectItem>
                <SelectItem value="uncounted">Never counted</SelectItem>
                <SelectItem value="all">All items</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Physical</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Δ Value</TableHead>
                  <TableHead>Last counted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                      {filter === "mismatched" ? "No mismatches found — all counted stock reconciles." : "No items match this filter."}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r: any) => {
                  const isShort = r._variance !== null && r._variance < 0;
                  const isSurplus = r._variance !== null && r._variance > 0;
                  const matched = r._variance === 0;
                  return (
                    <TableRow key={r.id} className={isShort ? "bg-destructive/5" : isSurplus ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                      <TableCell>
                        <div className="font-medium text-sm">{r.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{r.asset_tag ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.inventory_categories?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.location ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r._sys} {r.unit}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r._phys === null ? <span className="text-muted-foreground italic">—</span> : `${r._phys} ${r.unit}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r._variance === null ? (
                          <Badge variant="outline" className="text-[10px]">Not counted</Badge>
                        ) : matched ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 gap-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Match
                          </Badge>
                        ) : isShort ? (
                          <Badge variant="destructive" className="gap-1 text-[10px]">
                            <MinusCircle className="h-3 w-3" /> {r._variance} {r.unit}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1 text-[10px]">
                            <PlusCircle className="h-3 w-3" /> +{r._variance} {r.unit}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right text-xs tabular-nums ${isShort ? "text-destructive font-semibold" : isSurplus ? "text-amber-700" : ""}`}>
                        {r._varianceValue === null ? "—" : `${r._varianceValue >= 0 ? "+" : ""}₵${r._varianceValue.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r._last ? (
                          <div>
                            <div>{format(new Date(r._last.counted_at), "PP")}</div>
                            <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r._last.counted_at), { addSuffix: true })}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">never</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {stats.shortageValue > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span><strong>Compliance flag:</strong> shortage of <strong>₵{stats.shortageValue.toFixed(2)}</strong> across {stats.mismatched} item(s). Investigate before next reconciliation.</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
