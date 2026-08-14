import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Repeat, ShieldCheck, Check, X, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Navigate } from "react-router-dom";

type Proposal = {
  id: string;
  proposer_id: string;
  proposer_user_id: string;
  title: string;
  summary: string;
  status: string;
  effective_from: string;
  pattern: any;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  proposer?: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
};

const STATUS_TONE: Record<string, string> = {
  pending:   "bg-warning/15 text-warning border-warning/30",
  approved:  "bg-success/15 text-success border-success/30",
  rejected:  "bg-destructive/15 text-destructive border-destructive/30",
  withdrawn: "bg-muted text-muted-foreground border-border",
  applied:   "bg-primary/15 text-primary border-primary/30",
};

export default function RotationChangeApprovals() {
  const { role } = useAuth();
  const qc = useQueryClient();

  const canApprove = !!role && [
    "admin","oic","2ic","chief_staff_officer","head_of_administration",
  ].includes(role);

  const [tab, setTab] = useState<"pending"|"decided">("pending");
  const [active, setActive] = useState<Proposal | null>(null);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<"approved"|"rejected"|null>(null);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["rotation-proposals-queue", tab],
    enabled: canApprove,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_change_proposals")
        .select(`
          id, proposer_id, proposer_user_id, title, summary, status,
          effective_from, pattern, reviewer_id, review_comment, reviewed_at, created_at,
          proposer:profiles!rotation_change_proposals_proposer_id_fkey ( first_name, last_name, staff_id )
        `)
        .in("status", tab === "pending" ? ["pending"] : ["approved","rejected","withdrawn","applied"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Proposal[];
    },
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (!active || !decision) throw new Error("Pick a decision");
      if (comment.trim().length < 5)
        throw new Error("Please leave a short comment for the audit trail.");
      const { error } = await supabase
        .from("rotation_change_proposals")
        .update({ status: decision, review_comment: comment.trim() })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Proposal ${decision}`);
      qc.invalidateQueries({ queryKey: ["rotation-proposals-queue"] });
      setActive(null);
      setComment("");
      setDecision(null);
    },
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  if (!canApprove) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Repeat className="h-5 w-5 text-secondary" />
        <h1 className="text-2xl font-bold text-secondary">Shift Rotation Approvals</h1>
        <Badge variant="outline" className="ml-2 text-[10px] gap-1">
          <ShieldCheck className="h-3 w-3" /> Command tier
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Review unit-wide rotation change proposals submitted by Admins, Staff Officers,
        OIC/2IC, Supervisors, and the Head of IPSE. Approvals are recorded with your
        identity and a comment for the audit trail.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <ProposalList items={proposals} loading={isLoading} onPick={setActive} />
        </TabsContent>
        <TabsContent value="decided" className="mt-4">
          <ProposalList items={proposals} loading={isLoading} onPick={setActive} readOnly />
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) { setActive(null); setComment(""); setDecision(null); } }}>
        <DialogContent className="max-w-3xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {active.title}
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[active.status]}`}>
                    {active.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Submitted by {active.proposer?.first_name ?? ""} {active.proposer?.last_name ?? ""}{" "}
                  ({active.proposer?.staff_id ?? "—"}) on {format(new Date(active.created_at), "dd/MM/yyyy HH:mm")}.
                  Effective from <strong>{active.effective_from}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Justification</Label>
                  <p className="text-sm mt-1 bg-muted/40 p-3 rounded">{active.summary}</p>
                </div>

                <PatternPreview pattern={active.pattern} />

                <AuditTrail proposalId={active.id} />

                {active.status === "pending" ? (
                  <>
                    <div>
                      <Label className="text-xs">Reviewer comment (required)</Label>
                      <Textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="e.g. Approved with effect from cycle start."
                      />
                    </div>
                  </>
                ) : (
                  active.review_comment && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Reviewer comment</Label>
                      <p className="text-sm mt-1 italic bg-muted/40 p-3 rounded">{active.review_comment}</p>
                    </div>
                  )
                )}
              </div>

              <DialogFooter className="gap-2">
                {active.status === "pending" ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => { setDecision("rejected"); decide.mutate(); }}
                      disabled={decide.isPending}
                    >
                      {decide.isPending && decision === "rejected"
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <X className="h-4 w-4 mr-2" />}
                      Reject
                    </Button>
                    <Button
                      onClick={() => { setDecision("approved"); decide.mutate(); }}
                      disabled={decide.isPending}
                    >
                      {decide.isPending && decision === "approved"
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <Check className="h-4 w-4 mr-2" />}
                      Approve
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setActive(null)}>Close</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProposalList({
  items, loading, onPick, readOnly,
}: { items: Proposal[]; loading: boolean; onPick: (p: Proposal) => void; readOnly?: boolean }) {
  if (loading) return <div className="text-sm text-muted-foreground p-6 text-center">Loading…</div>;
  if (!items.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No proposals here.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <Card key={p.id} className="hover:border-primary/40 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {p.title}
              <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[p.status]}`}>
                {p.status}
              </Badge>
              <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> {p.effective_from}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              {p.proposer?.first_name ?? ""} {p.proposer?.last_name ?? ""}{" "}
              ({p.proposer?.staff_id ?? "—"}) • cycle {p.pattern?.cycle_days}d •
              submitted {format(new Date(p.created_at), "dd MMM HH:mm")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex items-center gap-2">
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{p.summary}</p>
            <Button size="sm" variant={readOnly ? "outline" : "default"} onClick={() => onPick(p)}>
              {readOnly ? "View" : "Review"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PatternPreview({ pattern }: { pattern: any }) {
  const { data: shifts = [] } = useQuery({
    queryKey: ["rotation-approval-shift-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const shiftName = (id?: string | null) =>
    shifts.find((s: any) => s.id === id)?.name ?? (id ? "Unknown" : "Off");

  if (pattern?.scope === "reassignment") {
    const staff: string[] = pattern.staff_ids ?? [];
    return (
      <div className="border rounded-lg p-3 text-sm space-y-1.5 bg-muted/30">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reassignment proposal
        </div>
        <div><strong>Target:</strong> {pattern.target_group === "ALL" ? "All groups" : `Group ${pattern.target_group}`}</div>
        <div><strong>New shift:</strong> {shiftName(pattern.new_shift_id)}</div>
        <div><strong>Date range:</strong> {pattern.date_from} → {pattern.date_to}</div>
        <div>
          <strong>Specific staff:</strong>{" "}
          {staff.length ? staff.join(", ") : <em className="text-muted-foreground">whole group</em>}
        </div>
      </div>
    );
  }

  const days: number = pattern?.cycle_days ?? 0;
  const groups: Record<string, (string | null)[]> = pattern?.groups ?? {};
  if (!days) return null;
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-xs" style={{ minWidth: 700 }}>
        <thead>
          <tr className="bg-muted/50">
            <th className="px-2 py-2 text-left">Group</th>
            {Array.from({ length: days }, (_, i) => (
              <th key={i} className="px-2 py-2 text-left">Day {i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {["A","B","C","D"].map((g) => (
            <tr key={g} className="border-t">
              <td className="px-2 py-2 font-bold">{g}</td>
              {Array.from({ length: days }, (_, i) => (
                <td key={i} className="px-2 py-2 text-muted-foreground">
                  {groups[g]?.[i] ? (
                    <span className="text-foreground text-[11px]">{shiftName(groups[g]![i])}</span>
                  ) : "Off"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  comment: string | null;
  created_at: string;
  actor: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
};

const ACTION_TONE: Record<string, string> = {
  submitted: "bg-primary/15 text-primary border-primary/30",
  approved:  "bg-success/15 text-success border-success/30",
  rejected:  "bg-destructive/15 text-destructive border-destructive/30",
  withdrawn: "bg-muted text-muted-foreground border-border",
  applied:   "bg-secondary/15 text-secondary border-secondary/30",
  edited:    "bg-warning/15 text-warning border-warning/30",
};

function AuditTrail({ proposalId }: { proposalId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["rotation-proposal-audit", proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_change_proposal_audit")
        .select(`
          id, action, previous_status, new_status, comment, created_at,
          actor:profiles!rotation_change_proposal_audit_actor_profile_id_fkey ( first_name, last_name, staff_id )
        `)
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Audit trail</Label>
      {isLoading ? (
        <p className="text-xs text-muted-foreground italic">Loading audit…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No audit entries.</p>
      ) : (
        <ol className="border rounded-lg divide-y">
          {entries.map((e) => (
            <li key={e.id} className="px-3 py-2 text-xs flex items-start gap-2">
              <Badge variant="outline" className={`text-[10px] capitalize ${ACTION_TONE[e.action] ?? ""}`}>
                {e.action}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {e.actor?.first_name ?? "System"} {e.actor?.last_name ?? ""}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({e.actor?.staff_id ?? "—"})
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss")}
                  {e.previous_status && e.new_status && e.previous_status !== e.new_status
                    ? ` • ${e.previous_status} → ${e.new_status}`
                    : ""}
                </div>
                {e.comment && (
                  <div className="mt-0.5 italic text-muted-foreground">"{e.comment}"</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
