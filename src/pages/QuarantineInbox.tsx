// src/pages/QuarantineInbox.tsx
// Staff self-service view of items the firewall flagged on their behalf.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ShieldAlert, Inbox, FileText, Link2, Flag, Send } from "lucide-react";
import { toast } from "sonner";

const layerIcon: Record<string, JSX.Element> = {
  file: <FileText className="h-4 w-4" />,
  url: <Link2 className="h-4 w-4" />,
  auth: <ShieldAlert className="h-4 w-4" />,
  waf: <Flag className="h-4 w-4" />,
};

export default function QuarantineInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [evidence, setEvidence] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-quarantine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firewall_quarantine")
        .select("id,layer,subject,reason,status,created_at,reviewed_at,review_reason")
        .eq("reported_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["my-quarantine-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firewall_quarantine_review_requests")
        .select("id,quarantine_id,status,evidence_note,review_note,reviewed_at,created_at")
        .eq("requested_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!reviewing) return;
      const { error } = await supabase.from("firewall_quarantine_review_requests").insert({
        quarantine_id: reviewing.id,
        requested_by: user!.id,
        evidence_note: evidence.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review request sent to admins");
      setReviewing(null);
      setEvidence("");
      qc.invalidateQueries({ queryKey: ["my-quarantine-requests", user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const requestForRow = (qid: string) =>
    (requests as any[]).find(r => r.quarantine_id === qid);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-800",
      released: "bg-emerald-100 text-emerald-800",
      blocked: "bg-destructive/15 text-destructive",
      expired: "bg-muted text-muted-foreground",
    };
    return <Badge className={map[s] || ""}>{s}</Badge>;
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5 text-primary" /> My Quarantine Inbox</CardTitle>
          <CardDescription>
            Files, links, or actions of yours that were held by the firewall for safety. Add an evidence note and request admin review if you believe an item is safe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>You have no quarantined items. Good job!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r: any) => {
                const req = requestForRow(r.id);
                return (
                  <div key={r.id} className="rounded-lg border p-3 space-y-2 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <div className="mt-0.5 text-muted-foreground">{layerIcon[r.layer] ?? <Flag className="h-4 w-4" />}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{r.subject || "(no subject)"}</div>
                          <div className="text-xs text-muted-foreground">{r.reason}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Flagged {new Date(r.created_at).toLocaleString()} • Layer: {r.layer}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {statusBadge(r.status)}
                        {req && (
                          <Badge variant="outline" className="text-xs">
                            Review: {req.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {r.review_reason && (
                      <div className="text-xs bg-muted/40 rounded p-2">
                        <strong>Admin note:</strong> {r.review_reason}
                      </div>
                    )}
                    {req?.review_note && (
                      <div className="text-xs bg-muted/40 rounded p-2">
                        <strong>Review outcome:</strong> {req.review_note}
                      </div>
                    )}
                    <div className="flex justify-end">
                      {!req && r.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setEvidence(""); }}>
                          <Send className="h-3.5 w-3.5 mr-1.5" /> Request review
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={o => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request admin review</DialogTitle>
            <DialogDescription>
              Explain why this item is safe. Provide context (source, expected use, related ticket). Minimum 10 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs bg-muted/40 rounded p-2">
            <strong>Item:</strong> {reviewing?.subject}<br />
            <strong>Reason flagged:</strong> {reviewing?.reason}
          </div>
          <Textarea
            value={evidence}
            onChange={e => setEvidence(e.target.value)}
            placeholder="e.g. This is a vendor invoice from ECG. The PDF was scanned in our office."
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              onClick={() => submitReview.mutate()}
              disabled={evidence.trim().length < 10 || submitReview.isPending}
            >
              {submitReview.isPending ? "Sending…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
