import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Trash2, MapPin, Webhook } from "lucide-react";
import { toast } from "sonner";

type Override = {
  id: string;
  scope_type: "location" | "department";
  scope_value: string;
  variance_qty_threshold: number;
  variance_value_threshold: number;
  enabled: boolean;
  webhook_url: string | null;
  webhook_enabled: boolean;
};

export function InventoryAlertOverrides() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canManage = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");

  const { data: overrides = [] } = useQuery({
    queryKey: ["inventory_alert_overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_alert_overrides" as any)
        .select("id, scope_type, scope_value, variance_qty_threshold, variance_value_threshold, enabled, webhook_url, webhook_enabled")
        .order("scope_type")
        .order("scope_value");
      if (error) throw error;
      return (data ?? []) as unknown as Override[];
    },
  });

  // Locations available from inventory_items so the user can pick known offices
  const { data: locations = [] } = useQuery({
    queryKey: ["inventory_item_locations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("location")
        .not("location", "is", null);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.location && set.add(r.location));
      return Array.from(set).sort();
    },
  });

  const [scopeType, setScopeType] = useState<"location" | "department">("location");
  const [scopeValue, setScopeValue] = useState("");
  const [qty, setQty] = useState(1);
  const [val, setVal] = useState(100);

  const addMut = useMutation({
    mutationFn: async () => {
      if (!scopeValue.trim()) throw new Error("Pick or enter an office/location");
      const { error } = await supabase.from("inventory_alert_overrides" as any).insert({
        scope_type: scopeType,
        scope_value: scopeValue.trim(),
        variance_qty_threshold: Math.max(0, Math.floor(qty)),
        variance_value_threshold: Math.max(0, Number(val) || 0),
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override added");
      setScopeValue("");
      qc.invalidateQueries({ queryKey: ["inventory_alert_overrides"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (o: Partial<Override> & { id: string }) => {
      const { error } = await supabase
        .from("inventory_alert_overrides" as any)
        .update(o)
        .eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory_alert_overrides"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_alert_overrides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removed");
      qc.invalidateQueries({ queryKey: ["inventory_alert_overrides"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const knownLocations = useMemo(() => locations as string[], [locations]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Per-department / location thresholds
        </CardTitle>
        <CardDescription>
          Override the global variance thresholds for specific offices, stores or departments.
          Falls back to the global setting when no override exists.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-3">
              <Label className="text-xs">Scope</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="location">Location / Office</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-4">
              <Label className="text-xs">Name</Label>
              {scopeType === "location" && knownLocations.length > 0 ? (
                <Select value={scopeValue} onValueChange={setScopeValue}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {knownLocations.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder={scopeType === "department" ? "e.g. CYBER & MISD" : "e.g. Main Store"}
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Qty</Label>
              <Input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Value (₵)</Label>
              <Input type="number" min={0} step="0.01" value={val} onChange={(e) => setVal(Number(e.target.value))} />
            </div>
            <div className="sm:col-span-1">
              <Button size="sm" className="w-full gap-1" onClick={() => addMut.mutate()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {overrides.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            No overrides yet — global thresholds apply to every item.
          </div>
        ) : (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div key={o.id} className="rounded-md border p-2 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize gap-1">
                    <MapPin className="h-3 w-3" /> {o.scope_type}
                  </Badge>
                  <span className="font-medium">{o.scope_value}</span>
                  <div className="flex items-center gap-1 ml-2">
                    <Label className="text-[11px] text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 w-20"
                      disabled={!canManage}
                      value={o.variance_qty_threshold}
                      onChange={(e) =>
                        updateMut.mutate({ id: o.id, variance_qty_threshold: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground">₵</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-7 w-24"
                      disabled={!canManage}
                      value={o.variance_value_threshold}
                      onChange={(e) =>
                        updateMut.mutate({ id: o.id, variance_value_threshold: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Switch
                      checked={o.enabled}
                      disabled={!canManage}
                      onCheckedChange={(v) => updateMut.mutate({ id: o.id, enabled: v })}
                    />
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive"
                        onClick={() => deleteMut.mutate(o.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <Webhook className="h-3.5 w-3.5 text-primary" />
                  <Label className="text-[11px] text-muted-foreground">Webhook</Label>
                  <Switch
                    checked={o.webhook_enabled}
                    disabled={!canManage}
                    onCheckedChange={(v) => updateMut.mutate({ id: o.id, webhook_enabled: v })}
                  />
                  <Input
                    placeholder="https://hooks.slack.com/services/... (overrides global)"
                    className="h-7 flex-1 min-w-[220px]"
                    disabled={!canManage || !o.webhook_enabled}
                    defaultValue={o.webhook_url ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (o.webhook_url ?? null)) {
                        updateMut.mutate({ id: o.id, webhook_url: v as any });
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
