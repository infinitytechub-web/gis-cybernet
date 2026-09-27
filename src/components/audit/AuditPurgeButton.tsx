import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";

/**
 * Purge old audit entries. Visible only to Super Admins and admins granted
 * purge access; the server re-checks every call and records the purge.
 */
export function AuditPurgeButton({ table, label, onPurged }: { table: string; label?: string; onPurged?: () => void }) {
  const qc = useQueryClient();
  const { data: allowed } = useQuery({
    queryKey: ["can-purge-audit"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("can_purge_audit");
      return data === true;
    },
  });
  const cutoffMax = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState(cutoffMax);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!allowed) return null;

  const run = async () => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("purge_audit_records", {
      _table: table, _before: `${before}T00:00:00Z`, _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Purged ${data ?? 0} entr${data === 1 ? "y" : "ies"}`);
    setOpen(false); setReason(""); setConfirm("");
    qc.invalidateQueries();
    onPurged?.();
  };

  return (
    <>
      <Button variant="destructive" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Purge
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge {label ?? "audit entries"}</DialogTitle>
            <DialogDescription>
              Permanently removes entries older than the chosen date (at least 30 days old). The purge itself is recorded and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Delete entries before</Label>
              <DateInput value={before} max={cutoffMax} onChange={(e) => setBefore(e.target.value)} />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Retention period reached" />
            </div>
            <div>
              <Label>Type PURGE to confirm</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || confirm !== "PURGE" || reason.trim().length < 8 || before > cutoffMax} onClick={run}>
              {busy ? "Purging…" : "Purge permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
