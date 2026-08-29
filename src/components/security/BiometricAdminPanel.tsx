/**
 * Administrator oversight of every enrolled biometric credential.
 * Admins can review enrolled devices per staff member, revoke a single device
 * or reset a staff member's enrollment entirely so they can enrol again.
 * Both actions require a confirmation and a written reason (audited).
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
import { Fingerprint, RefreshCw, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/date-format";

interface AdminCredential {
  id: string;
  user_id: string;
  full_name: string | null;
  staff_id: string | null;
  device_label: string;
  backed_up: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Pending admin action awaiting confirmation + reason. */
type PendingAction =
  | { kind: "revoke"; row: AdminCredential }
  | { kind: "reset"; userId: string; staffName: string; deviceCount: number };

export function BiometricAdminPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminCredential[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("webauthn_admin_list_credentials");
    if (error) {
      toast({ title: "Could not load credentials", description: error.message, variant: "destructive" });
    }
    setRows((data as AdminCredential[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.staff_id, r.device_label].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  /** Active device count per staff member, for the reset action. */
  const activeByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.revoked_at) continue;
      map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const openRevoke = useCallback((row: AdminCredential) => {
    setReason("");
    setPending({ kind: "revoke", row });
  }, []);

  const openReset = useCallback((row: AdminCredential) => {
    setReason("");
    setPending({
      kind: "reset",
      userId: row.user_id,
      staffName: row.full_name ?? row.staff_id ?? "this staff member",
      deviceCount: activeByUser.get(row.user_id) ?? 0,
    });
  }, [activeByUser]);

  const confirmAction = useCallback(async () => {
    if (!pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      toast({ title: "Reason required", description: "Enter at least 5 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (pending.kind === "revoke") {
        const { error } = await supabase.rpc("webauthn_revoke_credential", {
          _id: pending.row.id,
          _reason: `Admin revoke: ${trimmed}`,
        });
        if (error) throw new Error(error.message);
        toast({
          title: "Device removed",
          description: `${pending.row.device_label} can no longer sign in with biometrics.`,
        });
      } else {
        const { data, error } = await supabase.rpc("webauthn_admin_reset_user", {
          _user_id: pending.userId,
          _reason: trimmed,
        });
        if (error) throw new Error(error.message);
        const removed = Number(data ?? 0);
        toast({
          title: "Enrollment reset",
          description: `${removed} device${removed === 1 ? "" : "s"} removed. ${pending.staffName} can enrol again from their own device.`,
        });
      }
      setPending(null);
      setReason("");
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [pending, reason, load, toast]);


  const active = rows.filter((r) => !r.revoked_at).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
          Enrolled Biometric Devices
          <Badge variant="secondary">{active} active</Badge>
        </CardTitle>
        <CardDescription>
          Every device registered for fingerprint or Face ID sign-in. Revoking a device forces that
          staff member back to password sign-in on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by name, staff ID or device"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search enrolled biometric devices"
          />
          <Button variant="outline" onClick={load} disabled={loading} aria-label="Refresh list">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7}>No enrolled devices.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                  <TableCell>{r.staff_id ?? "—"}</TableCell>
                  <TableCell>{r.device_label}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell>{r.last_used_at ? formatDate(r.last_used_at) : "Never"}</TableCell>
                  <TableCell>
                    {r.revoked_at
                      ? <Badge variant="outline">Revoked {formatDate(r.revoked_at)}</Badge>
                      : <Badge>Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!r.revoked_at && (
                        <Button variant="outline" size="sm" onClick={() => openRevoke(r)} aria-label={`Remove ${r.device_label}`}>
                          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          Remove
                        </Button>
                      )}
                      {(activeByUser.get(r.user_id) ?? 0) > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openReset(r)}
                          aria-label={`Reset all passkeys for ${r.full_name ?? r.staff_id ?? "staff member"}`}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                          Reset all
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) { setPending(null); setReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "reset" ? "Reset biometric enrollment" : "Remove enrolled device"}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "reset"
                ? `This removes all ${pending.deviceCount} enrolled device${pending.deviceCount === 1 ? "" : "s"} for ${pending.staffName}. They will sign in with their password and can enrol again from their own device.`
                : pending?.kind === "revoke"
                ? `${pending.row.device_label} will no longer sign in with biometrics for ${pending.row.full_name ?? "this staff member"}. The device can be enrolled again by its owner.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="biometric-reset-reason">Reason (recorded in the audit trail)</Label>
            <Textarea
              id="biometric-reset-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Staff member lost the enrolled phone"
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setReason(""); }} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmAction} disabled={busy || reason.trim().length < 5}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {pending?.kind === "reset" ? "Reset enrollment" : "Remove device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

  );
}

export default BiometricAdminPanel;
