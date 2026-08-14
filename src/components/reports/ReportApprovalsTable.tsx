import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Download, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { triggerDownload } from "@/lib/download-utils";

interface Props {
  reports: any[];
  onPreview: (report: any) => void;
  showActions?: boolean; // when true, supervisors/command tier see approve/reject buttons
}

export default function ReportApprovalsTable({ reports, onPreview, showActions }: Props) {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [decision, setDecision] = useState<{ report: any; action: "approved" | "rejected" } | null>(null);
  const [comment, setComment] = useState("");

  const decideMutation = useMutation({
    mutationFn: async ({ report, action, note }: { report: any; action: "approved" | "rejected"; note: string }) => {
      if (action === "rejected" && !note.trim()) throw new Error("Comment required when rejecting");
      const { error } = await supabase
        .from("report_uploads")
        .update({
          approval_status: action,
          review_comment: note.trim() || null,
        })
        .eq("id", report.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-approved-reports"] });
      toast.success(vars.action === "approved" ? "Report approved" : "Report returned to submitter");
      setDecision(null);
      setComment("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDownload = async (report: any) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 60);
    if (data?.signedUrl) triggerDownload(data.signedUrl, report.file_name);
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-success/15 text-success hover:bg-success/15"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15"><XCircle className="h-3 w-3 mr-1" />Returned</Badge>;
    return <Badge className="bg-warning/15 text-warning hover:bg-warning/15"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  if (reports.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No reports in this view</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved By / At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r: any) => {
              const canDecide = showActions && isAdminOrSupervisor && r.approval_status === "pending";
              const isOwner = r.submitted_by === user?.id || r.uploaded_by === user?.id;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.title}</div>
                    {r.review_comment && (
                      <div className="text-[11px] text-muted-foreground flex items-start gap-1 mt-0.5 max-w-md">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="italic">{r.review_comment}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell className="text-sm">{format(new Date(r.report_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-xs capitalize">{r.source || "manual"}</TableCell>
                  <TableCell>{statusBadge(r.approval_status)}</TableCell>
                  <TableCell className="text-xs">
                    {r.approved_at ? (
                      <span title={format(new Date(r.approved_at), "dd/MM/yyyy HH:mm")}>
                        {format(new Date(r.approved_at), "dd MMM HH:mm")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onPreview(r)} title="Preview"><Eye className="h-4 w-4" /></Button>
                      {(r.approval_status === "approved" || isOwner || isAdmin || isAdminOrSupervisor) && (
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(r)} title="Download"><Download className="h-4 w-4" /></Button>
                      )}
                      {canDecide && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-success hover:text-success"
                            title="Approve"
                            onClick={() => { setDecision({ report: r, action: "approved" }); setComment(""); }}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Return to shift leader"
                            onClick={() => { setDecision({ report: r, action: "rejected" }); setComment(""); }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!decision} onOpenChange={(open) => { if (!open) { setDecision(null); setComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approved" ? "Approve report" : "Return report to shift leader"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{decision?.report?.title}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">
                {decision?.action === "rejected" ? "Reason / required corrections *" : "Comment (optional)"}
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={decision?.action === "rejected" ? "Explain what needs to change..." : "Optional note for the OIC/2IC trail..."}
                rows={3}
                required={decision?.action === "rejected"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecision(null); setComment(""); }}>Cancel</Button>
            <Button
              variant={decision?.action === "rejected" ? "destructive" : "default"}
              disabled={decideMutation.isPending || (decision?.action === "rejected" && !comment.trim())}
              onClick={() => decision && decideMutation.mutate({ report: decision.report, action: decision.action, note: comment })}
            >
              {decision?.action === "approved" ? "Approve" : "Return to Submitter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
