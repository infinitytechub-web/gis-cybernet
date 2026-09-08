/**
 * Administrator approval queue for biometric (fingerprint / Face ID) registrations.
 *
 * Staff register a device themselves — the passkey is created on their own
 * device — and the registration then waits here. Nothing can be used for
 * sign-in until an administrator approves it. Every decision is audited and the
 * staff member is notified.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Fingerprint, RefreshCw, Check, X, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/date-format";

interface PendingRow {
  id: string;
  user_id: string;
  full_name: string | null;
  staff_id: string | null;
  department: string | null;
  device_label: string;
  backed_up: boolean;
  created_at: string;
}

type Decision = { row: PendingRow; approve: boolean };

export function BiometricApprovalQueue() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Decision | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("webauthn_admin_pending_enrollments");
    if (error) {
      toast({ title: "Could not load registrations", description: error.message, variant: "destructive" });
    }
    setRows((data as PendingRow[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.staff_id, r.department, r.device_label]
        .some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const open = useCallback((row: PendingRow, approve: boolean) => {
    setNotes("");
    setPending({ row, approve });
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const trimmed = notes.trim();
    if (!pending.approve && trimmed.length < 5) {
      toast({
        title: "Reason required",
        description: "Enter at least 5 characters explaining the rejection.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("webauthn_admin_review_enrollment", {
        _id: pending.row.id,
        _approve: pending.approve,
        _notes: trimmed || null,
      });
      if (error) throw new Error(error.message);
      toast({
        title: pending.approve ? "Enrollment approved" : "Enrollment rejected",
        description: pending.approve
          ? `${pending.row.device_label} can now be used for fingerprint sign-in.`
          : `${pending.row.device_label} was rejected and cannot be used.`,
      });
      setPending(null);
      setNotes("");
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [pending, notes, load, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
          Pending Biometric Registrations
          <Badge variant={rows.length ? "destructive" : "secondary"}>{rows.length} awaiting</Badge>
        </CardTitle>
        <CardDescription>
          Staff register their fingerprint on their own device; the registration cannot sign anyone
          in until you approve it here. Approving it also makes the staff member count as enrolled on
          the coverage report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by name, staff ID, department or device"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pending biometric registrations"
          />
          <Button variant="outline" onClick={load} disabled={loading} aria-label="Refresh queue">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No registrations are waiting for approval.
                  </TableCell>
                </TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                  <TableCell>{r.staff_id ?? "—"}</TableCell>
                  <TableCell>{r.department ?? "—"}</TableCell>
                  <TableCell>{r.device_label}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => open(r, true)}>
                        <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => open(r, false)}>
                        <X className="mr-1 h-4 w-4" aria-hidden="true" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.approve ? "Approve biometric enrollment" : "Reject biometric enrollment"}
            </DialogTitle>
            <DialogDescription>
              {pending
                ? `${pending.row.full_name ?? pending.row.staff_id ?? "This staff member"} — ${pending.row.device_label}. ${
                    pending.approve
                      ? "The device will be able to sign in with fingerprint or Face ID."
                      : "The device will be blocked and the staff member asked to register again."
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="biometric-review-notes">
              {pending?.approve ? "Note (optional)" : "Reason for rejection"}
            </Label>
            <Textarea
              id="biometric-review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={pending?.approve ? "Verified in person" : "Why is this registration rejected?"}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirm}
              disabled={busy}
              variant={pending?.approve ? "default" : "destructive"}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {pending?.approve ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default BiometricApprovalQueue;
