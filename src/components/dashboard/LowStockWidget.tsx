import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function LowStockWidget() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("low-stock-widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, () => {
        qc.invalidateQueries({ queryKey: ["low-stock-widget"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: items = [] } = useQuery({
    queryKey: ["low-stock-widget"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, name, qty_on_hand, min_stock, unit, inventory_categories(name)")
        .eq("is_active", true);
      return (data || []).filter(
        (i: any) => Number(i.min_stock) > 0 && Number(i.qty_on_hand) <= Number(i.min_stock)
      );
    },
    refetchInterval: 60_000,
  });

  if (items.length === 0) return null;

  const outOfStock = items.filter((i: any) => Number(i.qty_on_hand) <= 0);
  const lowStock = items.filter((i: any) => Number(i.qty_on_hand) > 0);

  return (
    <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Low Stock Alerts — Reorder Required
          <Badge variant="outline" className="ml-auto text-[10px] border-amber-400">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          {outOfStock.length > 0 && <Badge variant="destructive">{outOfStock.length} out of stock</Badge>}
          {lowStock.length > 0 && <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{lowStock.length} below minimum</Badge>}
        </div>
        <div className="max-h-[200px] overflow-y-auto space-y-1">
          {items.slice(0, 8).map((i: any) => {
            const out = Number(i.qty_on_hand) <= 0;
            return (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 p-2 rounded bg-background border text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className={`h-3.5 w-3.5 shrink-0 ${out ? "text-destructive" : "text-amber-600"}`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    <div className="text-muted-foreground text-[10px] truncate">
                      {i.inventory_categories?.name || "Uncategorized"}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${out ? "border-destructive text-destructive" : "border-amber-400 text-amber-700 dark:text-amber-300"}`}>
                  {Number(i.qty_on_hand)} / {Number(i.min_stock)} {i.unit}
                </Badge>
              </div>
            );
          })}
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/stores")}>
          Manage Inventory →
        </Button>
      </CardContent>
    </Card>
  );
}
