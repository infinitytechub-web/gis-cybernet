// src/components/auth/MfaStepUpDialog.tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logSecurityEvent } from "@/lib/security-audit";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TRUSTED_DEVICE_HOURS,
  TRUSTED_DEVICE_DURATIONS,
  isTrustedDevice,
  rememberTrustedDevice,
} from "@/lib/mfa-trusted-device";

/** True when the current session has already completed a 2FA challenge. */
export async function hasVerifiedMfaSession(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

/**
 * True when step-up can be skipped for a client-side gate: either the session
 * is already AAL2, or this device carries an unexpired "remember" grant.
 * Server-guarded actions must keep using hasVerifiedMfaSession() instead.
 */
export async function isStepUpSatisfied(userId?: string | null): Promise<boolean> {
  if (await hasVerifiedMfaSession()) return true;
  return isTrustedDevice(userId);
}

/** Recognises the server-side "AAL2 required" refusal. */
export function isAal2Required(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return /aal2/i.test(msg);
}

interface MfaStepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the session is upgraded to AAL2. */
  onVerified: () => void;
  /** Short description of the action being protected. */
  action?: string;
  /** Offer the "remember this device" option (default true). */
  allowRemember?: boolean;
}

/**
 * Elevates the current session to a verified 2FA session (AAL2) by completing
 * a fresh challenge against the user's enrolled authenticator, then re-runs the
 * protected action. Required by server-side checks on sensitive MFA operations.
 */
export default function MfaStepUpDialog({
  open,
  onOpenChange,
  onVerified,
  action = "this action",
  allowRemember = true,
}: MfaStepUpDialogProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [noFactor, setNoFactor] = useState(false);
  const [remember, setRemember] = useState(false);
  const [rememberHours, setRememberHours] = useState<number>(DEFAULT_TRUSTED_DEVICE_HOURS);

  const reset = () => {
    setCode("");
    setNoFactor(false);
  };

  const verify = async () => {
    if (code.replace(/\D/g, "").length !== 6) return;
    setBusy(true);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const totp = factors?.totp?.find((f) => f.status === "verified") ?? factors?.totp?.[0];
      if (!totp) {
        setNoFactor(true);
        return;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code: code.replace(/\D/g, ""),
      });
      if (verifyError) throw verifyError;

      if (allowRemember && remember) {
        const { data: session } = await supabase.auth.getUser();
        if (session?.user?.id) {
          await rememberTrustedDevice(session.user.id, rememberHours);
          logSecurityEvent({
            category: "mfa",
            action: "stepup_device_remembered",
            severity: "warn",
            detail: `Trusted for ${rememberHours}h`,
          });
        }
      }

      logSecurityEvent({ category: "mfa", action: "session_stepup_verified", severity: "warn" });
      toast.success("Verified 2FA session active");
      reset();
      onOpenChange(false);
      onVerified();
    } catch (e) {
      logSecurityEvent({ category: "mfa", action: "session_stepup_failed", severity: "high" });
      toast.error((e as { message?: string })?.message || "Verification failed");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Confirm with 2FA
          </DialogTitle>
          <DialogDescription>
            A verified 2FA session is required before {action}. Enter the current 6-digit code from
            your authenticator app.
          </DialogDescription>
        </DialogHeader>

        {noFactor ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              No authenticator device is enrolled on this account. Set one up first, then try again.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex justify-center py-2">
            <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        {!noFactor && allowRemember && (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="mfa-remember-device"
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
              />
              <Label htmlFor="mfa-remember-device" className="text-xs font-medium">
                Remember this device
              </Label>
            </div>
            {remember && (
              <div className="flex items-center gap-2">
                <Select
                  value={String(rememberHours)}
                  onValueChange={(v) => setRememberHours(Number(v))}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRUSTED_DEVICE_DURATIONS.map((h) => (
                      <SelectItem key={h} value={String(h)} className="text-xs">
                        {h} hours
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">
                  Skips this prompt on this browser only.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={verify} disabled={busy || noFactor || code.replace(/\D/g, "").length !== 6}>
            {busy ? "Verifying…" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
