/**
 * Step-up confirmation for sensitive actions.
 *
 * Asks for a fresh fingerprint / Face ID confirmation, and automatically falls
 * back to password re-entry when biometrics are unavailable, not enrolled, or
 * fail. Returns a single-use, short-lived step-up token hash.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, KeyRound, Loader2 } from "lucide-react";
import { biometricsAvailable, confirmStepUp, type StepUpAction } from "@/lib/webauthn";
import { useToast } from "@/hooks/use-toast";

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: StepUpAction;
  /** Plain-language description of what is about to happen. */
  actionLabel: string;
  /** Called with the single-use step-up token hash once confirmed. */
  onConfirmed: (tokenHash: string, method: "biometric" | "password") => void;
}

export function StepUpDialog({
  open,
  onOpenChange,
  action,
  actionLabel,
  onConfirmed,
}: StepUpDialogProps) {
  const { toast } = useToast();
  const [canBiometric, setCanBiometric] = useState<boolean | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setBusy(false);
    void biometricsAvailable().then((ok) => {
      setCanBiometric(ok);
      setUsePassword(!ok);
    });
  }, [open]);

  const finish = useCallback((tokenHash: string, method: "biometric" | "password") => {
    onConfirmed(tokenHash, method);
    onOpenChange(false);
  }, [onConfirmed, onOpenChange]);

  const runBiometric = useCallback(async () => {
    setBusy(true);
    try {
      const { tokenHash, method } = await confirmStepUp(action);
      finish(tokenHash, method);
    } catch (e) {
      const msg = (e as Error)?.message ?? "Confirmation failed";
      if (msg === "NO_BIOMETRIC") {
        setUsePassword(true);
        toast({
          title: "No biometric device enrolled",
          description: "Confirm with your password instead, or enrol a device in Security Settings.",
        });
      } else if (/NotAllowedError|abort/i.test(msg)) {
        setUsePassword(true);
      } else {
        toast({ title: "Confirmation failed", description: msg, variant: "destructive" });
        setUsePassword(true);
      }
    } finally {
      setBusy(false);
    }
  }, [action, finish, toast]);

  const runPassword = useCallback(async () => {
    if (!password) return;
    setBusy(true);
    try {
      const { tokenHash, method } = await confirmStepUp(action, { password });
      finish(tokenHash, method);
    } catch (e) {
      toast({
        title: "Confirmation failed",
        description: (e as Error)?.message ?? "Incorrect password",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [action, password, finish, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm your identity</DialogTitle>
          <DialogDescription>
            {actionLabel} is a sensitive operation. Confirm it is really you before continuing.
          </DialogDescription>
        </DialogHeader>

        {!usePassword ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use your device fingerprint or Face ID to confirm.
            </p>
            <Button onClick={runBiometric} disabled={busy || canBiometric === null} className="w-full">
              {busy
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />}
              {busy ? "Waiting for your device…" : "Confirm with biometrics"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setUsePassword(true)} disabled={busy}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              Use my password instead
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stepup-password">Your password</Label>
              <Input
                id="stepup-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runPassword(); }}
              />
            </div>
            {canBiometric && (
              <Button variant="ghost" className="w-full" onClick={() => setUsePassword(false)} disabled={busy}>
                <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
                Use biometrics instead
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {usePassword && (
            <Button onClick={runPassword} disabled={busy || !password}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StepUpDialog;
