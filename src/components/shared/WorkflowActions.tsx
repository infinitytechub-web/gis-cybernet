/**
 * Shared Submitted → Queried → Recommended → Approved workflow controls.
 *
 * Any record that flows up the chain can use this: the buttons offered depend
 * on the current stage and on whether the signed-in officer is allowed to act.
 * Every action requires a note and is written to `workflow_transitions`, which
 * is append-only, so the trail cannot be edited afterwards.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MessageCircleQuestion, ThumbsUp, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/date-format";

export const WORKFLOW_STAGES = ["submitted", "queried", "recommended", "approved", "rejected"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_LABELS: Record<string, string> = {
  submitted: "Submitted",
  queried: "Queried",
  recommended: "Recommended",
  approved: "Approved",
  rejected: "Rejected",
};

export function workflowStageColor(stage: string | null | undefined) {
  switch (stage) {
    case "approved": return "bg-emerald-100 text-emerald-800";
    case "recommended": return "bg-sky-100 text-sky-800";
    case "queried": return "bg-amber-100 text-amber-800";
    case "rejected": return "bg-red-100 text-red-800";
    default: return "bg-muted text-muted-foreground";
  }
}

export function WorkflowStageBadge({ stage }: { stage: string | null | undefined }) {
  return (
    <Badge className={workflowStageColor(stage)}>
      {WORKFLOW_LABELS[stage ?? ""] ?? "Submitted"}
    </Badge>
  );
}

type Transition = {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  created_at: string;
  actor_name: string | null;
};

export function WorkflowActions({
  entityType,
  entityId,
  stage,
  canQuery,
  canRecommend,
  canApprove,
  onChanged,
}: {
  /** Logical record type, e.g. "leave_request", "excuse_duty_form". */
  entityType: string;
  entityId: string;
  stage: string | null | undefined;
  canQuery?: boolean;
  canRecommend?: boolean;
  canApprove?: boolean;
  onChanged?: (next: WorkflowStage) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<WorkflowStage | null>(null);
  const [note, setNote] = useState("");

  const { data: history = [] } = useQuery({
    queryKey: ["workflow-transitions", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_transitions")
        .select("id, from_stage, to_stage, note, created_at, actor_name")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transition[];
    },
    enabled: !!entityId,
  });

  const act = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("No action selected");
      if (!note.trim()) throw new Error("A note is required");
      const { error } = await supabase.from("workflow_transitions").insert({
        entity_type: entityType,
        entity_id: entityId,
        from_stage: stage ?? "submitted",
        to_stage: pending,
        note: note.trim(),
      });
      if (error) throw error;
      await onChanged?.(pending);
    },
    onSuccess: () => {
      toast.success(`Marked ${WORKFLOW_LABELS[pending ?? ""]?.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["workflow-transitions", entityType, entityId] });
      setPending(null);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (next: WorkflowStage) => { setPending(next); setNote(""); };
  const current = stage ?? "submitted";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <WorkflowStageBadge stage={current} />
        {canQuery && current !== "approved" && (
          <Button size="sm" variant="outline" onClick={() => open("queried")}>
            <MessageCircleQuestion className="mr-1 h-4 w-4" /> Query
          </Button>
        )}
        {canRecommend && current !== "approved" && current !== "recommended" && (
          <Button size="sm" variant="outline" onClick={() => open("recommended")}>
            <ThumbsUp className="mr-1 h-4 w-4" /> Recommend
          </Button>
        )}
        {canApprove && current !== "approved" && (
          <Button size="sm" onClick={() => open("approved")}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
          </Button>
        )}
        {(canApprove || canRecommend) && current !== "rejected" && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => open("rejected")}>
            <XCircle className="mr-1 h-4 w-4" /> Reject
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {history.map((h) => (
            <li key={h.id}>
              <span className="font-medium text-foreground">
                {WORKFLOW_LABELS[h.to_stage] ?? h.to_stage}
              </span>{" "}
              · {h.actor_name ?? "—"} · {formatDateTime(h.created_at)}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ol>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{WORKFLOW_LABELS[pending ?? ""] ?? "Action"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="workflow-note">Note (required)</Label>
            <Textarea
              id="workflow-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason or remarks — kept in the record's trail"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={act.isPending || !note.trim()} onClick={() => act.mutate()}>
              {act.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkflowActions;
