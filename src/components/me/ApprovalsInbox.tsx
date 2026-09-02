import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date-format";
import { toast } from "sonner";
import { ApprovalDecisionDialog, type ApprovalItem } from "./ApprovalDecisionDialog";

const db = supabase as any;

type QueueFilter = "open" | "approved" | "rejected" | "returned";

export function ApprovalsInbox() {
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [rows, setRows] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await db.rpc("me_approval_queue", { _status: filter });
    if (error) toast.error(error.message);
    else setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div><p className="text-sm font-medium text-primary">Governance and assurance</p><h1 className="text-2xl font-bold tracking-tight">M&E Approvals</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review objectives, programs and projects through their recorded approval steps.</p></div>
        </div>
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh approvals"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approval status">
        {(["open", "approved", "rejected", "returned"] as QueueFilter[]).map((item) => <Button key={item} variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)} className="capitalize">{item}</Button>)}
      </div>
      <Card>
        <CardHeader><CardTitle>{filter === "open" ? "Open approvals" : `${filter} approvals`}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b bg-muted/40 text-left"><th className="px-4 py-3 font-medium text-muted-foreground">Record</th><th className="px-4 py-3 font-medium text-muted-foreground">Workflow</th><th className="px-4 py-3 font-medium text-muted-foreground">Requested by</th><th className="px-4 py-3 font-medium text-muted-foreground">Due</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading approvals…</td></tr> : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No approvals in this view.</td></tr> : rows.map((row) => <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{row.record_name ?? "Unnamed record"}</p><p className="text-xs capitalize text-muted-foreground">{row.record_type} · {row.status}</p></td>
                  <td className="px-4 py-3"><Badge variant="secondary">Step {row.current_step ?? 1} / {row.total_steps ?? 1}</Badge></td>
                  <td className="px-4 py-3">{row.requested_by_name ?? "—"}</td>
                  <td className="px-4 py-3"><span className={row.overdue ? "font-medium text-destructive" : ""}>{formatDate(row.due_date)}</span>{row.overdue && <Clock3 className="ml-1 inline h-3.5 w-3.5" aria-label="Overdue" />}</td>
                  <td className="px-4 py-3 text-right">{filter === "open" && row.can_decide ? <Button onClick={() => setSelected(row)}><CheckCircle2 className="mr-2 h-4 w-4" /> Review</Button> : <span className="text-muted-foreground">Recorded</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <ApprovalDecisionDialog approval={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} onCompleted={() => void load()} />
    </div>
  );
}
