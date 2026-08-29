/**
 * Biometric enrollment gate.
 *
 * When an administrator has switched on the biometric enrollment requirement,
 * staff holding one of the required roles are prompted to enroll this device.
 * During the grace period the prompt can be postponed; once the deadline has
 * passed it becomes blocking until a passkey is registered.
 *
 * Passkeys can only be created on the staff member's own device, so this
 * prompt is the enrollment mechanism — nothing is enrolled on their behalf.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Fingerprint, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { biometricsAvailable, currentDeviceLabel, enrollBiometric } from "@/lib/webauthn";
import { formatDate } from "@/lib/date-format";

export interface EnrollmentStatus {
  policy_required: boolean;
  globally_enabled: boolean;
  grace_days: number;
  enforced_at: string | null;
  deadline: string | null;
  required_for_me: boolean;
  device_count: number;
  enrolled: boolean;
  days_left: number;
  overdue: boolean;
}

const SNOOZE_KEY = "cybernet.biometric-enrollment.snoozed";

export function BiometricEnrollmentGate() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [snoozed, setSnoozed] = useState(() => {
    try {
      return sessionStorage.getItem(SNOOZE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("webauthn_my_enrollment_status");
    if (error) return;
    setStatus((data as unknown as EnrollmentStatus) ?? null);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    void biometricsAvailable().then(setAvailable);
  }, [user, load]);

  const snooze = useCallback(() => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, "1");
    } catch {
      /* non-persistent session storage is acceptable */
    }
    setSnoozed(true);
  }, []);

  const handleEnroll = useCallback(async () => {
    setBusy(true);
    try {
      const label = await enrollBiometric(true, currentDeviceLabel());
      toast({
        title: "Device enrolled",
        description: `${label} can now sign you in with biometrics.`,
      });
      await load();
    } catch (e) {
      const msg = (e as Error)?.message ?? "Enrollment failed";
      if (/NotAllowedError|abort/i.test(msg)) {
        toast({ title: "Enrollment cancelled", description: "You can try again at any time." });
      } else {
        toast({ title: "Enrollment failed", description: msg, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }, [load, toast]);

  if (!user || !status) return null;
  if (!status.required_for_me || status.enrolled) return null;

  const blocking = status.overdue;
  if (!blocking && snoozed) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !blocking) snooze(); }}>
      <DialogContent
        className={blocking ? "sm:max-w-lg [&>button]:hidden" : "sm:max-w-lg"}
        onInteractOutside={(e) => { if (blocking) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (blocking) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
            Enroll biometric sign-in
            {blocking ? (
              <Badge variant="destructive">Required now</Badge>
            ) : (
              <Badge variant="secondary">{status.days_left} day(s) left</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Your role requires fingerprint or Face ID sign-in on the devices you use for
            Cybernet HRM. Only your device's public key is stored — no fingerprint or face
            image ever leaves this device.
          </DialogDescription>
        </DialogHeader>

        {blocking ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Enrollment deadline passed</AlertTitle>
            <AlertDescription>
              The grace period ended{status.deadline ? ` on ${formatDate(status.deadline)}` : ""}.
              Enroll this device to continue.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Deadline{status.deadline ? `: ${formatDate(status.deadline)}` : ""}</AlertTitle>
            <AlertDescription>
              You can postpone until then, after which enrollment becomes mandatory.
            </AlertDescription>
          </Alert>
        )}

        {available === false && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>No biometric sensor detected</AlertTitle>
            <AlertDescription>
              Open Cybernet HRM on a device with fingerprint, Face ID or Windows Hello to
              complete enrollment, or contact an administrator.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {!blocking && (
            <Button variant="outline" onClick={snooze}>
              Remind me later
            </Button>
          )}
          <Button onClick={handleEnroll} disabled={busy || available === false}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Enroll this device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BiometricEnrollmentGate;
