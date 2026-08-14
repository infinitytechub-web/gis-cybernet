import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Save, Webhook, Mail } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  id: string;
  low_stock_enabled: boolean;
  variance_enabled: boolean;
  variance_qty_threshold: number;
  variance_value_threshold: number;
  alert_webhook_enabled: boolean;
  alert_email_enabled: boolean;
  email_recipients: string[];
};

export function InventoryAlertSettings() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");
  /**
   * Webhook addresses are internal integration endpoints, so they are readable
   * and writable by the command tier only. The column is not exposed through
   * the Data API — access goes through the secured RPCs below.
   */
  const canManageWebhook = ["admin", "oic", "2ic"].includes(role || "");

  const { data, isLoading } = useQuery({
    queryKey: ["inventory_alert_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_alert_settings" as any)
        .select(
          "id, low_stock_enabled, variance_enabled, variance_qty_threshold, variance_value_threshold, alert_webhook_enabled, alert_email_enabled, email_recipients",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Settings | null;
    },
  });

  const { data: webhookUrlServer } = useQuery({
    queryKey: ["inventory_alert_webhook", "settings"],
    enabled: canManageWebhook,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_inventory_alert_webhooks");
      if (error) throw error;
      const row = (data as any[] | null)?.find((r) => r.source === "settings");
      return (row?.webhook_url as string | null) ?? null;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    if (data) {
      setForm(data);
      setRecipientsRaw((data.email_recipients ?? []).join(", "));
    }
  }, [data]);

  useEffect(() => {
    setWebhookUrl(webhookUrlServer ?? "");
  }, [webhookUrlServer]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const recipients = recipientsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s && /\S+@\S+\.\S+/.test(s));
      const { error } = await supabase
        .from("inventory_alert_settings" as any)
        .update({
          low_stock_enabled: form.low_stock_enabled,
          variance_enabled: form.variance_enabled,
          variance_qty_threshold: Number(form.variance_qty_threshold) || 0,
          variance_value_threshold: Number(form.variance_value_threshold) || 0,
          alert_webhook_enabled: form.alert_webhook_enabled,
          alert_email_enabled: form.alert_email_enabled,
          email_recipients: recipients,
        })
        .eq("id", form.id);
      if (error) throw error;

      if (canManageWebhook && webhookUrl.trim() !== (webhookUrlServer ?? "")) {
        const { error: hookErr } = await (supabase as any).rpc("set_inventory_alert_webhook", {
          _source: "settings",
          _record_id: form.id,
          _webhook_url: webhookUrl.trim() || null,
        });
        if (hookErr) throw hookErr;
      }
    },
    onSuccess: () => {
      toast.success("Alert settings saved");
      qc.invalidateQueries({ queryKey: ["inventory_alert_settings"] });
      qc.invalidateQueries({ queryKey: ["inventory_alert_webhook", "settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Add a webhook URL first");
      return;
    }
    try {
      const r = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "✅ GIS Cybernet — test variance alert. Webhook working.",
        }),
      });
      if (r.ok) toast.success("Webhook reachable");
      else toast.error(`Webhook returned ${r.status}`);
    } catch (e: any) {
      toast.error(e.message ?? "Webhook test failed");
    }
  };


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
          <Bell className="h-4 w-4 text-primary" /> Alert thresholds & channels
        </CardTitle>
        <CardDescription>
          Configure when stores staff are notified about low stock and audit variances, and where alerts go.
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

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Webhook className="h-4 w-4 text-primary" />
              <Label className="text-sm">Webhook (Slack / Teams / Discord / custom)</Label>
            </div>
            <Switch
              checked={form.alert_webhook_enabled}
              disabled={!canEdit}
              onCheckedChange={(v) => setForm({ ...form, alert_webhook_enabled: v })}
            />
          </div>
          {canManageWebhook ? (
            <>
              <Input
                placeholder="https://hooks.slack.com/services/..."
                disabled={!form.alert_webhook_enabled}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={testWebhook}
                  disabled={!form.alert_webhook_enabled || !webhookUrl.trim()}
                >
                  Send test
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              The webhook address is restricted to Admin, OIC and 2IC. You can still switch webhook alerts on or off.
            </p>
          )}

        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-primary" />
              <Label className="text-sm">Email recipients</Label>
            </div>
            <Switch
              checked={form.alert_email_enabled}
              disabled={!canEdit}
              onCheckedChange={(v) => setForm({ ...form, alert_email_enabled: v })}
            />
          </div>
          <Input
            placeholder="storekeeper@gis.local, admin@gis.local"
            disabled={!canEdit || !form.alert_email_enabled}
            value={recipientsRaw}
            onChange={(e) => setRecipientsRaw(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Emails are dispatched once your sender domain is verified. Until then, in-app and webhook alerts still fire.
          </p>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
