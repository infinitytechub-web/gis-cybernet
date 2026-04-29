import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenu } from "@/components/ui/export-menu";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Coins, AlertTriangle, Users, Package, Wrench, FileBarChart } from "lucide-react";
import { InventoryAuditReport } from "./InventoryAuditReport";
import { exportReport } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function StoresReportsTab() {
  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items", "reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, asset_tag, name, qty_on_hand, min_stock, unit, unit_cost, location, condition, inventory_categories(name)")
        .order("name");
      return data ?? [];
    },
  });

  const { data: issuance = [] } = useQuery({
    queryKey: ["inventory_issuance", "reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_issuance")
        .select(
          "id, quantity, issued_at, returned_at, expected_return_date, inventory_items(name, unit), profiles!inventory_issuance_profile_id_fkey(first_name, last_name, staff_id, departments(name))",
        )
        .order("issued_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const valuation = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byLocation = new Map<string, number>();
    let total = 0;
    items.forEach((i: any) => {
      const v = Number(i.qty_on_hand) * Number(i.unit_cost ?? 0);
      total += v;
      const c = i.inventory_categories?.name ?? "Uncategorised";
      byCategory.set(c, (byCategory.get(c) ?? 0) + v);
      const l = i.location || "Unassigned";
      byLocation.set(l, (byLocation.get(l) ?? 0) + v);
    });
    return {
      total,
      byCategory: Array.from(byCategory.entries()).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
      byLocation: Array.from(byLocation.entries())
        .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    };
  }, [items]);

  const reorder = useMemo(() => {
    return items
      .map((i: any) => {
        const qty = Number(i.qty_on_hand);
        const min = Number(i.min_stock);
        const suggested = Math.max(0, min * 2 - qty);
        return { ...i, _qty: qty, _min: min, _suggested: suggested };
      })
      .filter((i: any) => i._min > 0 && i._qty <= i._min)
      .sort((a: any, b: any) => a._qty - b._qty);
  }, [items]);

  const ledger = useMemo(() => {
    return issuance.filter((r: any) => !r.returned_at);
  }, [issuance]);

  const overdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return ledger.filter((r: any) => r.expected_return_date && r.expected_return_date < today);
  }, [ledger]);

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          icon={Coins}
          label="Total stock value"
          value={`₵${valuation.total.toFixed(2)}`}
          accent="text-emerald-600"
        />
        <Tile
          icon={Package}
          label="Tracked items"
          value={items.length.toString()}
          accent="text-primary"
        />
        <Tile
          icon={AlertTriangle}
          label="Reorder needed"
          value={reorder.length.toString()}
          accent="text-amber-600"
        />
        <Tile
          icon={Users}
          label="Issued (open)"
          value={ledger.length.toString()}
          sub={overdue.length > 0 ? `${overdue.length} overdue` : undefined}
          accent={overdue.length > 0 ? "text-destructive" : "text-blue-600"}
        />
      </div>

      {/* Valuation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-600" /> Stock valuation
              </CardTitle>
              <CardDescription>Inventory worth by category and storage location.</CardDescription>
            </div>
            <ExportMenu
              getData={() => ({
                title: "Stock Valuation by Category",
                filename: `stock-valuation-${format(new Date(), "yyyy-MM-dd")}`,
                headers: ["Category", "Value (₵)"],
                rows: valuation.byCategory.map((r) => [r.name, r.value.toFixed(2)]),
              })}
            />
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={valuation.byCategory} dataKey="value" nameKey="name" outerRadius={90} label={(e) => `${e.name}`}>
                  {valuation.byCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `₵${Number(v).toFixed(2)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valuation.byLocation}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `₵${Number(v).toFixed(2)}`} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Reorder list */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Low-stock & reorder list
              </CardTitle>
              <CardDescription>
                Suggested order quantity = (2 × min stock) − current qty. Bring stock back to a safety buffer.
              </CardDescription>
            </div>
            <ExportMenu
              getData={() => ({
                title: "Reorder List",
                filename: `reorder-list-${format(new Date(), "yyyy-MM-dd")}`,
                headers: ["Asset Tag", "Item", "Category", "On Hand", "Min", "Suggested PO"],
                rows: reorder.map((r: any) => [
                  r.asset_tag ?? "",
                  r.name,
                  r.inventory_categories?.name ?? "",
                  `${r._qty} ${r.unit}`,
                  String(r._min),
                  `${r._suggested} ${r.unit}`,
                ]),
              })}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Suggested PO</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorder.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      All stock levels are healthy — no reorders needed.
                    </TableCell>
                  </TableRow>
                ) : (
                  reorder.map((r: any) => {
                    const out = r._qty <= 0;
                    return (
                      <TableRow key={r.id} className={out ? "bg-destructive/5" : "bg-amber-50/40 dark:bg-amber-950/10"}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{r.asset_tag ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.inventory_categories?.name ?? "—"}</TableCell>
                        <TableCell className={`text-right font-semibold ${out ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
                          {r._qty} <span className="text-xs text-muted-foreground font-normal">{r.unit}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">{r._min}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {r._suggested} {r.unit}
                        </TableCell>
                        <TableCell className="text-xs">{r.location ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Issuance ledger */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" /> Asset issuance ledger
              </CardTitle>
              <CardDescription>
                Open issues — items currently held by staff. Overdue rows are flagged.
              </CardDescription>
            </div>
            <ExportMenu
              getData={() => ({
                title: "Open Asset Issuance",
                filename: `issuance-open-${format(new Date(), "yyyy-MM-dd")}`,
                headers: ["Issued", "Item", "Qty", "Staff", "Staff ID", "Department", "Expected return"],
                rows: ledger.map((r: any) => [
                  format(new Date(r.issued_at), "yyyy-MM-dd"),
                  r.inventory_items?.name ?? "",
                  `${Number(r.quantity)} ${r.inventory_items?.unit ?? ""}`,
                  `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim(),
                  r.profiles?.staff_id ?? "",
                  r.profiles?.departments?.name ?? "",
                  r.expected_return_date ?? "",
                ]),
              })}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Issued</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Expected return</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      No outstanding asset issuances.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledger.map((r: any) => {
                    const isOverdue =
                      r.expected_return_date &&
                      r.expected_return_date < new Date().toISOString().slice(0, 10);
                    return (
                      <TableRow key={r.id} className={isOverdue ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs">{format(new Date(r.issued_at), "PP")}</TableCell>
                        <TableCell className="font-medium text-xs">{r.inventory_items?.name ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs">
                          {Number(r.quantity)} {r.inventory_items?.unit}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{`${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim()}</div>
                          <div className="font-mono text-muted-foreground text-[10px]">
                            {r.profiles?.staff_id ?? ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{r.profiles?.departments?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.expected_return_date ? (
                            <Badge
                              variant={isOverdue ? "destructive" : "secondary"}
                              className="font-normal"
                            >
                              {format(new Date(r.expected_return_date), "PP")}
                              {isOverdue && " · overdue"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className={`h-3.5 w-3.5 ${accent ?? "text-primary"}`} /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-destructive mt-0.5">{sub}</div>}
    </div>
  );
}
