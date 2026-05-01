import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Unlock, KeyRound, MoreVertical, Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UnlockAccountDialog } from "@/components/staff/UnlockAccountDialog";

interface AdminAccountActionsProps {
  profileId: string;
  staffId: string;
  fullName: string;
  accountLocked: boolean;
  hasUserId: boolean;
}

interface ResetResult {
  staff_id: string;
  full_name: string;
  email: string | null;
  temporary_password: string;
}

export function AdminAccountActions({ profileId, staffId, fullName, accountLocked, hasUserId }: AdminAccountActionsProps) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  // For accounts that aren't actually locked, this just clears server-side
  // failed-attempt counters — no audit/reason needed.
  const handleResetFailedAttempts = async () => {
    setUnlocking(true);
    try {
      const { error: rpcErr } = await supabase.rpc("admin_reset_failed_attempts", { _staff_id: staffId });
      if (rpcErr) throw rpcErr;
      toast.success(`Failed attempts cleared for ${fullName}`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to clear attempts");
    } finally {
      setUnlocking(false);
    }
  };

  const handleLock = async () => {
    setUnlocking(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ account_locked: true })
        .eq("id", profileId);
      if (error) throw error;
      toast.success(`Account locked for ${fullName}`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to lock account");
    } finally {
      setUnlocking(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    setConfirmReset(false);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { profile_id: profileId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as ResetResult);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const copyCredentials = async () => {
    if (!result) return;
    const text = `Staff ID: ${result.staff_id}\nName: ${result.full_name}\nTemporary Password: ${result.temporary_password}\n\n(User must change password on first login.)`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Credentials copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy. Select and copy manually.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Account actions">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {accountLocked ? (
            <DropdownMenuItem onClick={() => setUnlockOpen(true)} disabled={unlocking} className="gap-2">
              <Unlock className="h-4 w-4 text-emerald-600" />
              Unlock account…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleResetFailedAttempts} disabled={unlocking} className="gap-2">
              <Unlock className="h-4 w-4 text-emerald-600" />
              Reset failed attempts
            </DropdownMenuItem>
          )}
          {!accountLocked && (
            <DropdownMenuItem onClick={handleLock} disabled={unlocking} className="gap-2 text-destructive focus:text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Lock account
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmReset(true)}
            disabled={resetting || !hasUserId}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4 text-primary" />
            Reset password
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm reset */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {fullName}?</DialogTitle>
            <DialogDescription>
              This will generate a new temporary password and force the user to change it on next login.
              Their current password will be invalidated immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetting}>
              {resetting ? "Resetting..." : "Generate new password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show generated credentials */}
      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              New Credentials Generated
            </DialogTitle>
            <DialogDescription>
              Share these credentials securely with the staff member. This password will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/50 p-3 space-y-2 font-mono text-sm">
                <div><span className="text-muted-foreground">Staff ID:</span> <strong>{result.staff_id}</strong></div>
                <div><span className="text-muted-foreground">Name:</span> {result.full_name}</div>
                <div><span className="text-muted-foreground">Temp Password:</span> <strong className="select-all">{result.temporary_password}</strong></div>
              </div>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>The user will be required to set their own password on first login.</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>Close</Button>
            <Button onClick={copyCredentials} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy credentials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UnlockAccountDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        profileId={profileId}
        staffId={staffId}
        fullName={fullName}
        onUnlocked={() => queryClient.invalidateQueries({ queryKey: ["staff"] })}
      />
    </>
  );
}
