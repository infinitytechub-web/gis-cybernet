import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, PlayCircle, Plus, Trash2, FileDown, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const FREQS = ["hourly", "daily", "weekly", "monthly"] as const;
type Freq = typeof FREQS[number];

export function InventoryAuditScheduler() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canManage = ["admin", "oic", "2ic", "storekeeper"].includes(role || "");
  const [newFreq, setNewFreq] = useState<Freq>("daily");

  const { data: schedules = [] } = useQuery({
    queryKey: ["inventory_audit_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_audit_schedules" as any)
        .select("id, frequency, enabled, next_run_at, last_run_at, last_report_path")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["inventory_audit_runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_audit_runs" as any)
        .select("id, schedule_id, triggered_kind, mismatched_count, net_variance_value, report_csv_path, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_audit_schedules" as any).insert({
        frequency: newFreq,
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule added");
      qc.invalidateQueries({ queryKey: ["inventory_audit_schedules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (s: any) => {
      const { error } = await supabase
        .from("inventory_audit_schedules" as any)
        .update({ enabled: !s.enabled })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory_audit_schedules"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inventory_audit_schedules" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["inventory_audit_schedules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [runningId, setRunningId] = useState<string | null>(null);
  const runNow = async (scheduleId: string | null) => {
    setRunningId(scheduleId ?? "manual");
    try {
      const { data, error } = await supabase.functions.invoke("run-audit-scheduler", {
        body: { mode: "manual", schedule_id: scheduleId },
      });
      if (error) throw error;
      toast.success(
        `Audit complete — ${data?.result?.mismatched ?? 0} mismatches, net ₵${data?.result?.net_variance_value ?? 0}`,
      );
      qc.invalidateQueries({ queryKey: ["inventory_audit_runs"] });
      qc.invalidateQueries({ queryKey: ["inventory_audit_schedules"] });
    } catch (e: any) {
      toast.error(e.message ?? "Audit failed");
    } finally {
      setRunningId(null);
    }
  };

  const downloadReport = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("reports")
        .createSignedUrl(path, 60 * 5);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate link");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Scheduled audits
        </CardTitle>
        <CardDescription>
          Auto-run variance checks at a chosen frequency. Each run uploads a CSV to the Reports store and pushes alerts to your configured channels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Frequency</div>
              <Select value={newFreq} onValueChange={(v) => setNewFreq(v as Freq)}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQS.map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => createMut.mutate()}>
              <Plus className="h-3.5 w-3.5" /> Add schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 ml-auto"
              onClick={() => runNow(null)}
              disabled={runningId === "manual"}
            >
              {runningId === "manual" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Run audit now
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {schedules.length === 0 ? (
            <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
              No schedules yet — add one to start auto-running compliance audits.
            </div>
          ) : (
            schedules.map((s: any) => (
              <div
                key={s.id}
                className="rounded-md border p-3 flex flex-wrap items-center gap-3 text-sm"
              >
                <Badge variant="secondary" className="capitalize">{s.frequency}</Badge>
                <div className="text-xs text-muted-foreground">
                  Next:{" "}
                  {s.next_run_at
                    ? `${format(new Date(s.next_run_at), "PPp")} (${formatDistanceToNow(new Date(s.next_run_at), { addSuffix: true })})`
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last:{" "}
                  {s.last_run_at
                    ? formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true })
                    : "never"}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={s.enabled}
                    disabled={!canManage}
                    onCheckedChange={() => toggleMut.mutate(s)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={runningId === s.id}
                    onClick={() => runNow(s.id)}
                  >
                    {runningId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive"
                      onClick={() => deleteMut.mutate(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {runs.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Recent runs</div>
            {runs.map((r: any) => (
              <div
                key={r.id}
                className="rounded border bg-card px-3 py-2 text-xs flex flex-wrap items-center gap-2"
              >
                <Badge variant={r.triggered_kind === "manual" ? "outline" : "secondary"} className="capitalize">
                  {r.triggered_kind}
                </Badge>
                <span className="text-muted-foreground">
                  {format(new Date(r.created_at), "PPp")}
                </span>
                <Badge
                  variant={r.mismatched_count > 0 ? "destructive" : "secondary"}
                  className="bg-opacity-80"
                >
                  {r.mismatched_count} mismatched
                </Badge>
                <span>Net: ₵{Number(r.net_variance_value).toFixed(2)}</span>
                {r.report_csv_path && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 ml-auto gap-1"
                    onClick={() => downloadReport(r.report_csv_path)}
                  >
                    <FileDown className="h-3.5 w-3.5" /> CSV
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
