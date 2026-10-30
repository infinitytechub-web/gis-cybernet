import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";

type Row = { kind: "transfer" | "promotion"; id: string; staff_name: string; status: string; stage: string; from_unit: string | null; to_unit: string | null; detail: string | null; created_at: string; can_act: boolean };

export function CommandApprovalQueue() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["command-approval-queue"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("command_approval_queue");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const ch = supabase.channel(`approval-queue-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_transfer_requests" }, () => qc.invalidateQueries({ queryKey: ["command-approval-queue"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_promotions" }, () => qc.invalidateQueries({ queryKey: ["command-approval-queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const act = async (r: Row, yes: boolean) => {
    const fn = r.kind === "promotion" ? "decide_staff_promotion" : r.status === "pending" ? "recommend_staff_transfer" : "decide_staff_transfer";
    const args = fn === "recommend_staff_transfer" ? { _id: r.id, _recommend: yes } : { _id: r.id, _approve: yes };
    const { error } = await (supabase.rpc as any)(fn, args);
    if (error) return toast.error(error.message);
    toast.success(yes ? (fn === "recommend_staff_transfer" ? "Recommended to receiving command" : "Approved") : "Rejected");
    qc.invalidateQueries({ queryKey: ["command-approval-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const rows = q.data ?? [];
  const pager = usePagedList(rows);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Command approvals ({rows.length})</CardTitle></CardHeader>
      <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
        <p className="text-xs text-muted-foreground">Transfers: releasing command OIC/2IC recommends, then receiving command OIC/2IC approves. Promotions: the officer's command OIC/2IC approves.</p>
        {q.isError && <p className="text-sm text-destructive">Could not load approvals.</p>}
        {!q.isError && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing awaiting your command's approval.</p>}
        {pager.pageItems.map((r) => (
          <div key={r.kind + r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                <Badge variant="outline" className="mr-2 capitalize">{r.kind}</Badge>{r.staff_name || "Officer"}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.kind === "transfer" ? `${r.from_unit ?? "—"} → ${r.to_unit ?? "—"}` : `${r.from_unit ?? "No command"} · to ${r.detail}`} · Awaiting: {r.stage} · {formatDateTime(r.created_at)}
              </div>
            </div>
            {r.can_act ? (
              <div className="flex gap-1">
                <Button size="sm" onClick={() => act(r, true)}>{r.kind === "transfer" && r.status === "pending" ? "Recommend" : "Approve"}</Button>
                <Button size="sm" variant="outline" onClick={() => act(r, false)}>Reject</Button>
              </div>
            ) : <span className="text-xs text-muted-foreground">Awaiting another officer</span>}
          </div>
        ))}
      </CardContent>
      <div className="px-6 pb-4"><ListPagination {...pager} label="approvals" /></div>
    </Card>
  );
}
