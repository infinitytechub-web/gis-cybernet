// src/components/settings/FirewallAlertSettings.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

export function FirewallAlertSettings() {
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["firewall-alert-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firewall_alert_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("firewall_alert_settings").update(patch).eq("id", s!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["firewall-alert-settings"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!s) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /> Real-Time Admin Alerts</CardTitle>
        <CardDescription>Notify admins instantly when high-severity firewall events fire or when a user becomes a repeat offender.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Alert on every BLOCK</div>
              <p className="text-xs text-muted-foreground">High-confidence threats stopped immediately.</p>
            </div>
            <Switch checked={s.alert_on_block} onCheckedChange={v => update.mutate({ alert_on_block: v })} />
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Alert on every QUARANTINE</div>
              <p className="text-xs text-muted-foreground">Suspicious items held for admin review.</p>
            </div>
            <Switch checked={s.alert_on_quarantine} onCheckedChange={v => update.mutate({ alert_on_quarantine: v })} />
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Email alerts</div>
              <p className="text-xs text-muted-foreground">Send to admins via the email queue (requires email infra).</p>
            </div>
            <Switch checked={s.email_alerts} onCheckedChange={v => update.mutate({ email_alerts: v })} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
          <div>
            <Label className="text-xs">Repeat-offender threshold (events)</Label>
            <Input type="number" min={1} defaultValue={s.repeat_offender_threshold}
              onBlur={e => update.mutate({ repeat_offender_threshold: Math.max(1, Number(e.target.value)) })} />
          </div>
          <div>
            <Label className="text-xs">Window (minutes)</Label>
            <Input type="number" min={1} defaultValue={s.repeat_offender_window_minutes}
              onBlur={e => update.mutate({ repeat_offender_window_minutes: Math.max(1, Number(e.target.value)) })} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
