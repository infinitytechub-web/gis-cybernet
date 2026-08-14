import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Entry = {
  id: string;
  override_id: string | null;
  scope_type: string | null;
  scope_value: string | null;
  action: "created" | "updated" | "deleted";
  changed_fields: string[] | null;
  old_values: any;
  new_values: any;
  performed_by_name: string | null;
  created_at: string;
  entry_hash: string | null;
  prev_hash: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  variance_qty_threshold: "Qty threshold",
  variance_value_threshold: "₵ threshold",
  enabled: "Enabled",
  webhook_url: "Webhook URL",
  webhook_enabled: "Webhook on/off",
  scope_value: "Scope name",
  scope_type: "Scope type",
};

function describeChange(e: Entry): { field: string; from: string; to: string }[] {
  if (e.action !== "updated" || !e.changed_fields) return [];
  return e.changed_fields.map((f) => ({
    field: FIELD_LABELS[f] ?? f,
    from: format_value(e.old_values?.[f]),
    to: format_value(e.new_values?.[f]),
  }));
}
function format_value(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

export function InventoryThresholdAuditTrail() {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    | { total: number; verified: number; first_break_id: string | null; first_break_at: string | null }
    | null
  >(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["inventory_threshold_audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_alert_overrides_audit" as any)
        .select(
          "id, override_id, scope_type, scope_value, action, changed_fields, old_values, new_values, performed_by_name, created_at, entry_hash, prev_hash",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
    refetchInterval: 30_000,
  });

  const runVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.rpc("verify_threshold_audit_chain" as any);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setVerifyResult(row as any);
      if (row?.first_break_id) {
        toast.error(`Tamper detected at entry ${String(row.first_break_id).slice(0, 8)}…`);
      } else {
        toast.success(`Chain intact — ${row?.verified}/${row?.total} entries verified.`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const intact = verifyResult && !verifyResult.first_break_id;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Threshold change audit trail
          </CardTitle>
          <CardDescription>
            Tamper-evident log of every per-department threshold or webhook change. Each entry is SHA-256 hashed and chained to the previous one.
          </CardDescription>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={runVerify} disabled={verifying}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Verify chain
          </Button>
          {verifyResult && (
            <Badge
              variant={intact ? "secondary" : "destructive"}
              className={intact ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : ""}
            >
              {intact ? (
                <><ShieldCheck className="h-3 w-3 mr-1" />{verifyResult.verified}/{verifyResult.total} intact</>
              ) : (
                <><ShieldAlert className="h-3 w-3 mr-1" />break at {verifyResult.first_break_at && format(new Date(verifyResult.first_break_at), "dd/MM/yyyy HH:mm")}</>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-4">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            No threshold changes recorded yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {entries.map((e) => {
              const changes = describeChange(e);
              return (
                <div key={e.id} className="rounded-md border p-2.5 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        e.action === "deleted"
                          ? "destructive"
                          : e.action === "created"
                            ? "default"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {e.action}
                    </Badge>
                    <span className="font-medium">{e.scope_value ?? "—"}</span>
                    <Badge variant="outline" className="capitalize">{e.scope_type ?? "—"}</Badge>
                    <span className="ml-auto text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      {" · "}
                      {format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    by <span className="text-foreground">{e.performed_by_name ?? "system"}</span>
                  </div>
                  {changes.length > 0 && (
                    <ul className="pl-3 list-disc space-y-0.5">
                      {changes.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium">{c.field}:</span>{" "}
                          <span className="text-destructive line-through">{c.from}</span>
                          {" → "}
                          <span className="text-emerald-600 dark:text-emerald-400">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.action === "created" && e.new_values && (
                    <div className="text-muted-foreground">
                      Qty {e.new_values.variance_qty_threshold} · ₵{e.new_values.variance_value_threshold}
                      {e.new_values.webhook_enabled ? " · webhook on" : ""}
                    </div>
                  )}
                  {e.entry_hash && (
                    <div
                      className="font-mono text-[10px] text-muted-foreground/80 break-all"
                      title={`prev: ${e.prev_hash ?? "(genesis)"}\nhash: ${e.entry_hash}`}
                    >
                      <ShieldCheck className="inline h-3 w-3 mr-1 text-emerald-600" />
                      sha256: {e.entry_hash.slice(0, 16)}…{e.entry_hash.slice(-8)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
