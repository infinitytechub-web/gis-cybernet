import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Row = { kind: "transfer" | "promotion"; id: string; staff_name: string; status: string; stage: string; from_unit: string | null; to_unit: string | null; detail: string | null; created_at: string; can_act: boolean };

export function CommandApprovalQueue() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{ row: Row; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
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
    const args = fn === "recommend_staff_transfer" ? { _id: r.id, _recommend: yes, _note: note || null } : fn === "decide_staff_promotion" ? { _id: r.id, _approve: yes } : { _id: r.id, _approve: yes, _note: note || null };
    setBusy(true);
    try {
      const { error } = await (supabase.rpc as any)(fn, args);
      if (error) throw error;
      toast.success(yes ? (fn === "recommend_staff_transfer" ? "Recommended to receiving command" : "Approved") : "Rejected");
      setDecision(null); setNote("");
      for (const key of ["command-approval-queue", "admin-overview", "staff-applications", "staff-application", "service-record", "staff-profile", "hr-hub-staff-stats", "command-analytics"]) qc.invalidateQueries({ queryKey: [key] });
    } catch (error: any) { toast.error(error.message || "The decision could not be saved. Please retry."); }
    finally { setBusy(false); }
  };

  const rows = q.data ?? [];
  const filtered = rows.filter((r) => [r.staff_name, r.kind, r.from_unit, r.to_unit, r.detail].some((v) => (v || "").toLowerCase().includes(search.trim().toLowerCase())));
  const pager = usePagedList(filtered, { resetKey: search });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Command approvals ({q.isError || q.isLoading ? "—" : rows.length})</CardTitle><Input aria-label="Search command approvals" placeholder="Search officer, command or approval type" value={search} onChange={(e) => setSearch(e.target.value)} /></CardHeader>
      <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
        {q.isLoading && <p role="status">Loading approvals…</p>}
        {q.isError && <p className="text-sm text-destructive">Could not load approvals. <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Retry</Button></p>}
        {!q.isError && !q.isLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">{rows.length ? "No approvals match." : "Nothing awaiting your command's approval."}</p>}
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
                <Button size="sm" onClick={() => { setNote(""); setDecision({ row: r, approve: true }); }}>{r.kind === "transfer" && r.status === "pending" ? "Recommend" : "Approve"}</Button>
                <Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ row: r, approve: false }); }}>Reject</Button>
              </div>
            ) : <span className="text-xs text-muted-foreground">Awaiting another officer</span>}
          </div>
        ))}
      </CardContent>
      <div className="px-6 pb-4"><ListPagination {...pager} label="approvals" /></div>
      <Dialog open={!!decision} onOpenChange={(open) => { if (!open && !busy) setDecision(null); }}><DialogContent><DialogHeader><DialogTitle>{decision?.approve ? "Confirm approval" : "Confirm rejection"}</DialogTitle></DialogHeader><p className="text-sm">{decision?.row.staff_name} · {decision?.row.kind} · {decision?.row.stage}</p>{decision?.row.kind === "transfer" && <><Label htmlFor="command-decision-note">Decision note</Label><Textarea id="command-decision-note" value={note} onChange={(e) => setNote(e.target.value)} /></>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDecision(null)}>Cancel</Button><Button disabled={busy} onClick={() => decision && void act(decision.row, decision.approve)}>{busy ? "Saving…" : "Confirm decision"}</Button></DialogFooter></DialogContent></Dialog>
    </Card>
  );
}
