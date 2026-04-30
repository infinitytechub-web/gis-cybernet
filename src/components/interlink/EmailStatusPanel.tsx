import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, AlertTriangle, CheckCircle2, RefreshCw, Send, Loader2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";

/**
 * Cloud Email status panel for Interlink.
 *
 * - Shows the current email-domain verification snapshot (best effort —
 *   surfaced from notification log behaviour, since the dashboard tool is
 *   admin-only at the platform level).
 * - Lists recent failed Interlink notification emails with a per-row
 *   "Resend" action that calls the interlink-resend-notification edge
 *   function (gated server-side to Admin/OIC).
 */
export function EmailStatusPanel() {
  const { canExportInterlinkLogs } = useAuth();
  const qc = useQueryClient();
  const [resending, setResending] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["interlink-notif-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_notification_log")
        .select("status, channel")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      const total = data?.length ?? 0;
      const sent = data?.filter((r) => r.status === "sent").length ?? 0;
      const failed = data?.filter((r) => r.status === "failed").length ?? 0;
      return { total, sent, failed };
    },
    refetchInterval: 30_000,
  });

  const { data: failed = [], isLoading } = useQuery({
    queryKey: ["interlink-notif-failed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_notification_log")
        .select("id, dispatch_id, target_email, event, status, error_message, attempt_count, last_attempt_at, created_at, resent_at, resent_by, interlink_dispatches(subject)")
        .eq("status", "failed")
        .order("last_attempt_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  async function resend(id: string) {
    setResending(id);
    try {
      const { data, error } = await supabase.functions.invoke("interlink-resend-notification", {
        body: { log_id: id },
      });
      if (error) throw error;
      if (data?.status === "sent") toast.success("Notification resent");
      else toast.error(data?.error || "Resend failed");
      qc.invalidateQueries({ queryKey: ["interlink-notif-failed"] });
      qc.invalidateQueries({ queryKey: ["interlink-notif-stats"] });
    } catch (e: any) {
      toast.error(e.message || "Resend failed");
    } finally {
      setResending(null);
    }
  }

  // Health label derived from failure rate
  const failureRate =
    stats && stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
  const healthBadge =
    !stats || stats.total === 0 ? { label: "No traffic (7d)", tone: "bg-slate-100 text-slate-700" }
    : failureRate === 0 ? { label: "Healthy", tone: "bg-emerald-100 text-emerald-700" }
    : failureRate < 20 ? { label: "Degraded", tone: "bg-amber-100 text-amber-700" }
    : { label: "Unhealthy", tone: "bg-rose-100 text-rose-700" };

  return (
    <Card className="border-l-4 border-l-sky-500">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base flex items-center gap-2 mr-auto">
            <Mail className="h-4 w-4 text-sky-600" />
            Cloud Email — Interlink notifications
            <Badge className={healthBadge.tone}>{healthBadge.label}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => {
            qc.invalidateQueries({ queryKey: ["interlink-notif-failed"] });
            qc.invalidateQueries({ queryKey: ["interlink-notif-stats"] });
          }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
        <CardDescription>
          Verification & delivery health for review/approval emails sent by the workflow engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sent (7d)" value={stats?.sent ?? 0} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} tone="emerald" />
          <Stat label="Failed (7d)" value={stats?.failed ?? 0} icon={<AlertTriangle className="h-4 w-4 text-rose-600" />} tone="rose" />
          <Stat label="Failure rate" value={`${failureRate}%`} icon={<ShieldAlert className="h-4 w-4 text-amber-600" />} tone="amber" />
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recent failures</h4>
          <div className="overflow-x-auto rounded border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Dispatch</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : failed.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-emerald-700 italic">No failed notifications — all good.</TableCell></TableRow>
                ) : failed.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.last_attempt_at), "dd MMM HH:mm")}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate">{r.interlink_dispatches?.subject ?? r.dispatch_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{r.target_email ?? "—"}</TableCell>
                    <TableCell className="text-[11px] capitalize">{r.event.replace(/_/g, " ")}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.attempt_count}</Badge></TableCell>
                    <TableCell className="text-[11px] text-rose-700 max-w-[220px] truncate" title={r.error_message ?? ""}>{r.error_message ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canExportInterlinkLogs || resending === r.id || !r.target_email}
                        onClick={() => resend(r.id)}
                        title={!canExportInterlinkLogs ? "Admin or OIC only" : "Resend notification email"}
                      >
                        {resending === r.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5 mr-1" />}
                        Resend
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!canExportInterlinkLogs && (
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              Resending failed notifications is restricted to Admin and OIC.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: "emerald" | "rose" | "amber" }) {
  const toneCls = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/50",
    rose: "bg-rose-50 dark:bg-rose-950/20 border-rose-200/50",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-200/50",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
