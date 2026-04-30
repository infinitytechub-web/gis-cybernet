import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, CheckCircle2, XCircle, Eye, ClipboardList, Loader2, Send, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { exportApprovalsCSV, exportApprovalsXLSX, exportApprovalsPDF, type ApprovalExportRow } from "@/lib/interlink-export";

type StateFilter = "draft" | "review" | "approved" | "rejected";

export function ApprovalsTab() {
  const { user, isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<StateFilter>("draft");
  const [selected, setSelected] = useState<any | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["interlink-approval-queue", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_dispatches")
        .select("id, subject, scope, report_kind, source, workflow_state, recipient_count, attachment_count, performed_by, reviewer_id, approver_id, reviewed_at, approved_at, rejected_reason, schedule_id, created_at")
        .eq("workflow_state", tab)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: trail = [] } = useQuery({
    queryKey: ["interlink-approval-trail", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_approval_actions")
        .select("*")
        .eq("dispatch_id", selected!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function logAction(
    dispatchId: string,
    action: string,
    fromState: string,
    toState: string,
    note?: string,
  ) {
    await supabase.from("interlink_approval_actions").insert({
      dispatch_id: dispatchId,
      action,
      performed_by: user!.id,
      performer_role: "command_tier",
      from_state: fromState,
      to_state: toState,
      comment: note ?? null,
    });
  }

  async function transition(d: any, toState: StateFilter | "approved", action: string) {
    if ((action === "rejected") && !comment.trim()) {
      toast.error("A comment is required when rejecting");
      return;
    }
    setActing(true);
    try {
      const update: any = { workflow_state: toState };
      if (toState === "review") {
        update.reviewed_by = user!.id;
        update.reviewed_at = new Date().toISOString();
      } else if (toState === "approved") {
        update.approved_by = user!.id;
        update.approved_at = new Date().toISOString();
      } else if (toState === "rejected") {
        update.rejected_reason = comment.trim();
      }

      const { error } = await supabase
        .from("interlink_dispatches")
        .update(update)
        .eq("id", d.id);
      if (error) throw error;

      await logAction(d.id, action, d.workflow_state, toState, comment.trim() || undefined);
      toast.success(`Marked ${toState}`);
      setComment("");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["interlink-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["interlink-approval-trail"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(false);
    }
  }

  const counts = useMemo(() => ({
    draft: dispatches.filter((d: any) => d.workflow_state === "draft").length,
  }), [dispatches]);

  if (!isAdminOrSupervisor) {
    return <p className="text-sm text-muted-foreground p-4">Approvals are restricted to the command tier.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <h3 className="font-semibold">Approval workflow</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">Immutable audit log</Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as StateFilter)}>
        <TabsList>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="review">In review</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                  ) : dispatches.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground italic">No dispatches in this state.</TableCell></TableRow>
                  ) : dispatches.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{d.subject}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{d.scope} · {d.report_kind}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.source === "scheduled" ? "default" : "secondary"} className="text-[10px] capitalize">{d.source}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.recipient_count} · {d.attachment_count} files</TableCell>
                      <TableCell className="text-xs">{format(new Date(d.created_at), "PP p")}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(d)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> {selected.subject}
                </DialogTitle>
                <DialogDescription>
                  {selected.source} · {selected.scope} · {selected.recipient_count} recipients · {selected.attachment_count} files
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Audit trail</h4>
                  <ScrollArea className="h-48 border rounded p-2">
                    {trail.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic p-2">No actions yet.</p>
                    ) : trail.map((t: any) => (
                      <div key={t.id} className="text-xs py-1 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{t.action}</Badge>
                          <span className="text-muted-foreground">{format(new Date(t.created_at), "PP p")}</span>
                        </div>
                        {t.comment && <p className="text-muted-foreground italic mt-0.5">"{t.comment}"</p>}
                        <p className="text-[10px] text-muted-foreground font-mono truncate">hash: {t.entry_hash?.slice(0, 24)}…</p>
                      </div>
                    ))}
                  </ScrollArea>
                </div>

                {(selected.workflow_state === "draft" || selected.workflow_state === "review") && (
                  <div>
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
                      placeholder="Optional comment (required for reject)" rows={2} />
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                {selected.workflow_state === "draft" && (
                  <Button onClick={() => transition(selected, "review", "submitted_for_review")} disabled={acting}>
                    Submit for review
                  </Button>
                )}
                {selected.workflow_state === "review" && (
                  <>
                    <Button variant="outline" onClick={() => transition(selected, "rejected", "rejected")} disabled={acting}>
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" /> Reject
                    </Button>
                    <Button onClick={() => transition(selected, "approved", "approved")} disabled={acting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </>
                )}
                {selected.workflow_state === "approved" && (
                  <p className="text-xs text-muted-foreground">Approved {selected.approved_at && format(new Date(selected.approved_at), "PP p")}. Use Compose tab to send.</p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
