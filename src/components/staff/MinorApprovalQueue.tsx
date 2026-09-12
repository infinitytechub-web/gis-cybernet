/**
 * Minor (under 18) approvals.
 *
 * Any staff record whose date of birth is under 18 is flagged automatically by
 * the database and waits here for an administrator decision with a recorded
 * reason. Approving or rejecting never changes the record silently — the
 * decision, who made it and the reason are all stored.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInYears, format } from "date-fns";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type MinorRow = {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  minor_status: string;
  minor_review_reason: string | null;
  minor_reviewed_at: string | null;
};

export function MinorApprovalQueue({ canReview }: { canReview: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{ row: MinorRow; kind: "approved" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["minor-flagged-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, date_of_birth, minor_status, minor_review_reason, minor_reviewed_at")
        .eq("is_minor", true)
        .order("minor_status", { ascending: true })
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MinorRow[];
    },
  });

  const review = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Nothing selected");
      if (!reason.trim()) throw new Error("A reason is required");
      const { error } = await supabase.rpc("staff_review_minor", {
        _profile_id: decision.row.id,
        _decision: decision.kind,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decision recorded");
      queryClient.invalidateQueries({ queryKey: ["minor-flagged-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setDecision(null);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${r.first_name} ${r.last_name} ${r.staff_id}`.toLowerCase().includes(q);
  });
  const pending = filtered.filter((r) => r.minor_status === "pending");

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-emerald-100 text-emerald-800">Approved</Badge>;
    if (s === "rejected") return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">Pending approval</Badge>;
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          Minor records (under 18)
          {pending.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800">{pending.length} awaiting approval</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Records flagged automatically from the date of birth. An administrator must
          approve or reject each one with a reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name or staff ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No staff record is currently flagged as a minor.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.last_name}, {r.first_name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{r.staff_id}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Date of birth {r.date_of_birth ? format(new Date(r.date_of_birth), "dd/MM/yyyy") : "—"}
                    {r.date_of_birth && ` · age ${differenceInYears(new Date(), new Date(r.date_of_birth))}`}
                    {r.minor_review_reason && ` · ${r.minor_review_reason}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {statusBadge(r.minor_status)}
                  {canReview && r.minor_status !== "approved" && (
                    <Button size="sm" onClick={() => { setDecision({ row: r, kind: "approved" }); setReason(""); }}>
                      Approve
                    </Button>
                  )}
                  {canReview && r.minor_status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => { setDecision({ row: r, kind: "rejected" }); setReason(""); }}>
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!decision} onOpenChange={(open) => { if (!open) setDecision(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision?.kind === "approved" ? "Approve" : "Reject"} minor record
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="minor-reason">Reason (required)</Label>
            <Textarea
              id="minor-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded against the record and in the audit trail"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button disabled={review.isPending || !reason.trim()} onClick={() => review.mutate()}>
              {review.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default MinorApprovalQueue;
