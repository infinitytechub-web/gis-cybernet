import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UnlockAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  fullName: string;
  staffId?: string | null;
  onUnlocked?: () => void;
}

/**
 * Admin-only confirmation dialog that captures a justification (≥5 chars)
 * and calls the `admin_unlock_account` RPC, which writes to both
 * `account_unlock_audit` and `system_audit_log`.
 */
export function UnlockAccountDialog({
  open, onOpenChange, profileId, fullName, staffId, onUnlocked,
}: UnlockAccountDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      toast.error("Please enter a reason of at least 5 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("admin_unlock_account", {
        _profile_id: profileId,
        _reason: trimmed,
      });
      if (error) throw error;
      toast.success(`Account unlocked for ${fullName}`);
      setReason("");
      onOpenChange(false);
      onUnlocked?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to unlock account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-emerald-600" />
            Unlock account: {fullName}
          </DialogTitle>
          <DialogDescription>
            {staffId ? <>Staff ID <span className="font-mono">{staffId}</span>. </> : null}
            This clears failed login attempts, re-enables login, and writes an
            audit entry. A reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="unlock-reason">Reason for unlocking <span className="text-destructive">*</span></Label>
          <Textarea
            id="unlock-reason"
            placeholder="e.g. Verified identity in person; user forgot password after leave."
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/500 — minimum 5 characters.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || reason.trim().length < 5} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            {submitting ? "Unlocking..." : "Unlock account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
