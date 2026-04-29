import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  id: string;
  low_stock_enabled: boolean;
  variance_enabled: boolean;
  variance_qty_threshold: number;
  variance_value_threshold: number;
};

export function InventoryAlertSettings() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");

  const { data, isLoading } = useQuery({
    queryKey: ["inventory_alert_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_alert_settings" as any)
        .select("id, low_stock_enabled, variance_enabled, variance_qty_threshold, variance_value_threshold")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Settings | null;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("inventory_alert_settings" as any)
        .update({
          low_stock_enabled: form.low_stock_enabled,
          variance_enabled: form.variance_enabled,
          variance_qty_threshold: Number(form.variance_qty_threshold) || 0,
          variance_value_threshold: Number(form.variance_value_threshold) || 0,
        })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert settings saved");
      qc.invalidateQueries({ queryKey: ["inventory_alert_settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alert settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Alert thresholds
        </CardTitle>
        <CardDescription>
          Configure when stores staff and command tier are notified about low stock and audit variances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm">Low-stock alerts</Label>
            <p className="text-xs text-muted-foreground">Notify when on-hand qty crosses the item's minimum.</p>
          </div>
          <Switch
            checked={form.low_stock_enabled}
            disabled={!canEdit}
            onCheckedChange={(v) => setForm({ ...form, low_stock_enabled: v })}
          />
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Variance alerts</Label>
              <p className="text-xs text-muted-foreground">
                Trigger when a recorded count differs by more than the thresholds below.
              </p>
            </div>
            <Switch
              checked={form.variance_enabled}
              disabled={!canEdit}
              onCheckedChange={(v) => setForm({ ...form, variance_enabled: v })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity threshold (units)</Label>
              <Input
                type="number"
                min={0}
                disabled={!canEdit || !form.variance_enabled}
                value={form.variance_qty_threshold}
                onChange={(e) =>
                  setForm({ ...form, variance_qty_threshold: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Value threshold (₵)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canEdit || !form.variance_enabled}
                value={form.variance_value_threshold}
                onChange={(e) =>
                  setForm({ ...form, variance_value_threshold: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
              {saveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
