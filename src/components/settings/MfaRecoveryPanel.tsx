// src/components/settings/MfaRecoveryPanel.tsx
// Admin queue for staff who lost both MFA factor and backup codes.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldQuestion, Check, X } from "lucide-react";
import { toast } from "sonner";

export function MfaRecoveryPanel() {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<{ row: any; outcome: "approved" | "denied" } | null>(null);
  const [note, setNote] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["mfa-recovery-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mfa_recovery_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async () => {
      if (!reviewing) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles").select("first_name,last_name").eq("user_id", u.user!.id).maybeSingle();
      const label = prof ? `${prof.first_name} ${prof.last_name}` : null;
      const { error } = await supabase
        .from("mfa_recovery_requests")
        .update({
          status: reviewing.outcome,
          review_note: note.trim() || null,
          reviewed_by: u.user!.id,
          reviewed_label: label,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reviewing.row.id);
      if (error) throw error;
      // If approved, also unlock + clear MFA factors via existing admin RPC if locked.
      if (reviewing.outcome === "approved") {
        // Approving signals admin will manually clear factors; we just audit it.
        await supabase.rpc("log_security_event", {
          _category: "mfa", _action: "recovery_approved", _severity: "high",
          _subject: reviewing.row.staff_id, _details: { reason: reviewing.row.reason },
          _ip: null, _ua: null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      setReviewing(null); setNote("");
      qc.invalidateQueries({ queryKey: ["mfa-recovery-pending"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldQuestion className="h-5 w-5 text-amber-600" /> MFA Recovery Requests</CardTitle>
        <CardDescription>
          When a user loses both their authenticator and backup codes, they submit a recovery request here. After approving, manually clear their MFA factors in User Roles → Locked Accounts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No requests.</TableCell></TableRow>
              ) : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.staff_id || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[280px] truncate">{r.reason}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "pending" ? "outline" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setReviewing({ row: r, outcome: "approved" }); setNote(""); }}>
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setReviewing({ row: r, outcome: "denied" }); setNote(""); }}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!reviewing} onOpenChange={o => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewing?.outcome === "approved" ? "Approve" : "Deny"} MFA recovery</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Reviewer note (recorded in audit log)" value={note} onChange={e => setNote(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button variant={reviewing?.outcome === "approved" ? "default" : "destructive"}
              onClick={() => review.mutate()} disabled={review.isPending}>
              {review.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
