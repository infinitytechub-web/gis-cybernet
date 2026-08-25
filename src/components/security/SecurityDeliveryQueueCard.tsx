import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Inbox, RotateCw, Trash2 } from "lucide-react";

type Delivery = {
  id: string;
  webhook_id: string;
  webhook_label: string;
  status: string;
  attempts: number;
  max_attempts: number;
  alert_count: number;
  top_severity: string | null;
  next_attempt_at: string;
  last_status: string | null;
  last_error: string | null;
  delivered_at: string | null;
  dead_at: string | null;
  created_at: string;
};

const fmtDateTime = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const statusBadge = (s: string) => {
  if (s === "delivered") return <Badge variant="secondary">Delivered</Badge>;
  if (s === "dead") return <Badge variant="destructive">Dead-letter</Badge>;
  if (s === "in_flight") return <Badge variant="default">Sending</Badge>;
  return <Badge variant="outline">Queued</Badge>;
};

export function SecurityDeliveryQueueCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["security-webhook-deliveries", statusFilter],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("security_webhook_deliveries_list" as any, {
        _status: statusFilter === "all" ? null : statusFilter,
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Delivery[];
    },
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "requeue" | "discard" }) => {
      const { error } = await supabase.rpc("security_webhook_delivery_action" as any, { _id: id, _action: action });
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      toast.success(action === "requeue" ? "Delivery re-queued for retry" : "Delivery discarded");
      queryClient.invalidateQueries({ queryKey: ["security-webhook-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["security-monitor-webhooks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const dead = deliveries.filter((d) => d.status === "dead").length;
  const queued = deliveries.filter((d) => d.status === "pending" || d.status === "in_flight").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4" aria-hidden /> Delivery queue &amp; dead-letter
          </CardTitle>
          <CardDescription>
            Failed deliveries retry with exponential backoff and land here when their attempt budget is exhausted —
            {" "}{queued} queued, {dead} dead-lettered.
          </CardDescription>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All deliveries</SelectItem>
            <SelectItem value="pending">Queued</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="dead">Dead-letter</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Next retry</TableHead>
                <TableHead>Last result</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7}><Loader2 className="h-4 w-4 animate-spin" /></TableCell>
                </TableRow>
              ) : deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7} className="text-sm text-muted-foreground">
                    No webhook deliveries for the selected status.
                  </TableCell>
                </TableRow>
              ) : (
                deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(d.created_at)}</TableCell>
                    <TableCell className="font-medium">{d.webhook_label}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {d.alert_count}
                      {d.top_severity ? ` · ${d.top_severity}` : ""}
                    </TableCell>
                    <TableCell>{statusBadge(d.status)}</TableCell>
                    <TableCell className="text-xs">{d.attempts} / {d.max_attempts}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {d.status === "pending" ? fmtDateTime(d.next_attempt_at) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs" title={d.last_error ?? undefined}>
                      {d.last_status ?? "—"}
                      {d.last_error ? ` — ${d.last_error}` : ""}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="space-x-2 text-right">
                        {d.status !== "delivered" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: d.id, action: "requeue" })}
                          >
                            <RotateCw className="h-4 w-4" aria-hidden />
                            <span className="sr-only">Retry delivery</span>
                          </Button>
                        )}
                        {d.status !== "in_flight" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: d.id, action: "discard" })}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                            <span className="sr-only">Discard delivery</span>
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
