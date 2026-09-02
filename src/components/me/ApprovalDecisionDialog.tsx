import { useState } from "react";
import { Check, CornerDownLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const db = supabase as any;
type Decision = "approve" | "reject" | "return";

export type ApprovalItem = {
  id: string;
  record_type: string;
  record_id: string;
  record_name?: string | null;
  status: string;
  current_step?: number;
  total_steps?: number;
  due_date?: string | null;
  requested_by_name?: string | null;
  can_decide?: boolean;
};

const decisionLabels: Record<Decision, string> = {
  approve: "Approve",
  reject: "Reject",
  return: "Return for changes",
};

export function ApprovalDecisionDialog({
  approval,
  open,
  onOpenChange,
  onCompleted,
}: {
  approval: ApprovalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const [decision, setDecision] = useState<Decision>("approve");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!approval || !comment.trim()) {
      toast.error("A comment is required for every decision.");
      return;
    }
    setSaving(true);
    const { error } = await db.rpc("me_decide_approval", {
      _approval_id: approval.id,
      _decision: decision,
      _comment: comment.trim(),
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${decisionLabels[decision]}d ${approval.record_name ?? approval.record_type}`);
      setComment("");
      onOpenChange(false);
      onCompleted();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {approval?.record_name ?? "approval"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Record type</span><span className="font-medium capitalize">{approval?.record_type}</span></div>
            <div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Workflow step</span><span className="font-medium">{approval?.current_step ?? 1} of {approval?.total_steps ?? 1}</span></div>
            {approval?.requested_by_name && <div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Requested by</span><span className="font-medium">{approval.requested_by_name}</span></div>}
          </div>
          <div className="space-y-2">
            <Label>Decision</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(decisionLabels) as Decision[]).map((option) => (
                <Button key={option} type="button" variant={decision === option ? "default" : "outline"} onClick={() => setDecision(option)}>
                  {option === "approve" ? <Check className="mr-2 h-4 w-4" /> : option === "reject" ? <X className="mr-2 h-4 w-4" /> : <CornerDownLeft className="mr-2 h-4 w-4" />}
                  {decisionLabels[option]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approval-comment">Decision comment</Label>
            <Textarea id="approval-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Record the reason for this decision" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !comment.trim()}>{saving ? "Saving…" : "Record decision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
