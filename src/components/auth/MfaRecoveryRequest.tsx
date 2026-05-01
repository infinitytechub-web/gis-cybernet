// src/components/auth/MfaRecoveryRequest.tsx
// Lets a logged-in user (or someone in MFA challenge) request admin recovery.
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";

interface Props { triggerLabel?: string; staffIdHint?: string }

export default function MfaRecoveryRequest({ triggerLabel = "I lost access — request recovery", staffIdHint }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) { toast.error("You must be signed in"); return; }
    if (reason.trim().length < 10) { toast.error("Please describe the situation (10+ chars)"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("mfa_recovery_requests").insert({
        user_id: user.id,
        staff_id: staffIdHint ?? null,
        reason: reason.trim(),
      });
      if (error) throw error;
      toast.success("Request sent — admins have been notified");
      setOpen(false); setReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="gap-1.5 text-xs">
          <LifeBuoy className="h-3.5 w-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MFA recovery request</DialogTitle>
          <DialogDescription>
            Use this only if you've lost <strong>both</strong> your authenticator app and all backup codes. An admin will verify your identity offline before clearing your MFA.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Describe what happened (lost phone, locked out, etc.)" rows={5} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
