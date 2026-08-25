/**
 * PROCUREMENT INVENTORY — stock items with the procurement activity behind them.
 *
 * Every figure comes from the `procurement_inventory` RPC, which resolves access
 * server-side (storekeeper tier and command tier only) and joins stock levels to
 * the request lines and receipts that moved them.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package, Search, AlertTriangle, PackageCheck, Coins, Download } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { triggerDownload } from "@/lib/download-utils";
import { useProcurementStock, type ProcurementStockItem } from "@/hooks/useProcurementRequests";
import { csvCellQuoted } from "@/lib/csv-safe";

const money = (n: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 })
    .format(n || 0);

const LEVEL: Record<ProcurementStockItem["stock_level"], { label: string; cls: string }> = {
  out: { label: "Out of stock", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  low: { label: "Low stock", cls: "border-warning/40 bg-warning/10 text-warning-foreground" },
  ok: { label: "In stock", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

function Kpi({
  icon: Icon, label, value, hint,
}: { icon: typeof Package; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProcurementStockTab() {
  const { data, isLoading, error } = useProcurementStock(365);
  const [q, setQ] = useState("");

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      [i.name, i.sku, i.asset_tag, i.location, i.last_pr_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [items, q]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, i) => {
          acc.value += Number(i.stock_value) || 0;
          acc.units += Number(i.qty_on_hand) || 0;
          if (i.stock_level !== "ok") acc.attention += 1;
          acc.outstanding += Number(i.outstanding_qty) || 0;
          acc.openRequests += Number(i.open_requests) || 0;
          return acc;
        },
        { value: 0, units: 0, attention: 0, outstanding: 0, openRequests: 0 },
      ),
    [items],
  );

  const exportCsv = () => {
    const head = [
      "Item", "SKU", "Asset tag", "Location", "Unit", "Qty on hand", "Min stock",
      "Unit cost", "Stock value", "Level", "Ordered", "Received", "Outstanding",
      "Open requests", "Last receipt", "Last request",
    ];
    const rows = filtered.map((i) => [
      i.name, i.sku ?? "", i.asset_tag ?? "", i.location ?? "", i.unit,
      i.qty_on_hand, i.min_stock, i.unit_cost, i.stock_value, LEVEL[i.stock_level].label,
      i.ordered_qty, i.procured_qty, i.outstanding_qty, i.open_requests,
      i.last_received_at ? formatDateTime(i.last_received_at) : "",
      i.last_pr_number ?? "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => csvCellQuoted(String(c ?? ""))).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    triggerDownload(url, "procurement-inventory.csv");
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Package}
          label="Stock items"
          value={isLoading ? "…" : String(items.length)}
          hint={`${Math.round(totals.units)} unit${Math.round(totals.units) === 1 ? "" : "s"} on hand`}
        />
        <Kpi
          icon={Coins}
          label="Stock value"
          value={isLoading ? "…" : money(totals.value)}
          hint="At the latest recorded unit cost"
        />
        <Kpi
          icon={AlertTriangle}
          label="Needs attention"
          value={isLoading ? "…" : String(totals.attention)}
          hint="Items out of stock or below the minimum"
        />
        <Kpi
          icon={PackageCheck}
          label="On order"
          value={isLoading ? "…" : String(Math.round(totals.outstanding))}
          hint={`${totals.openRequests} open request${totals.openRequests === 1 ? "" : "s"} still to arrive`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Procurement inventory</CardTitle>
              <CardDescription>
                Stock levels linked to the requests and receipts that moved them
                {data?.as_of ? ` · as of ${formatDateTime(data.as_of)}` : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="w-56 pl-8"
                  placeholder="Search item, SKU, location…"
                  aria-label="Search stock items"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive">
              Could not load the inventory: {(error as Error).message}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Qty on hand</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Stock value</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Procurement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading inventory…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      {items.length === 0 ? "No stock items yet." : "No items match that search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[i.sku, i.asset_tag].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{i.location || "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {i.qty_on_hand} <span className="text-xs text-muted-foreground">{i.unit}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{i.min_stock}</TableCell>
                      <TableCell className="text-right text-sm">{money(i.unit_cost)}</TableCell>
                      <TableCell className="text-right text-sm">{money(i.stock_value)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={LEVEL[i.stock_level].cls}>
                          {LEVEL[i.stock_level].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[240px]">
                        <div className="text-sm">
                          {i.procured_qty}/{i.ordered_qty} received
                          {i.outstanding_qty > 0 && (
                            <span className="text-muted-foreground"> · {i.outstanding_qty} outstanding</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {i.open_requests} open · {i.request_lines} line
                          {i.request_lines === 1 ? "" : "s"}
                          {i.last_pr_number ? ` · ${i.last_pr_number}` : ""}
                        </div>
                        {i.last_received_at && (
                          <div className="text-xs text-muted-foreground">
                            Last receipt {formatDateTime(i.last_received_at)}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
