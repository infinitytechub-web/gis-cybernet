import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import TwoFactorSetup from "@/components/auth/TwoFactorSetup";
import { Button } from "@/components/ui/button";
import MfaStepUpDialog, { hasVerifiedMfaSession } from "@/components/auth/MfaStepUpDialog";

interface MfaPolicy {
  required?: boolean;
  grace_ends_at?: string | null;
  in_grace?: boolean;
  grace_days?: number | null;
}

/**
 * Self-service two-factor authentication for every signed-in staff member:
 * enrol a device, reset it, and manage backup codes without needing an
 * administrator. Shows how the current access policy applies to this account.
 */
export default function StaffMfaSettings() {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [aal2, setAal2] = useState<boolean | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const { data: policy } = useQuery<MfaPolicy>({
    queryKey: ["my-mfa-policy", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_mfa_policy" as never);
      if (error) throw error;
      return (data as unknown as MfaPolicy) ?? {};
    },
  });

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!active) return;
      setEnrolled(!!data?.totp?.some((f) => f.status === "verified") || (data?.totp?.length ?? 0) > 0);
    });
    hasVerifiedMfaSession().then((ok) => {
      if (active) setAal2(ok);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const required = !!policy?.required;
  const inGrace = !!policy?.in_grace;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Two-factor authentication</h2>
        {enrolled === true && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <ShieldCheck className="h-3 w-3 text-success" /> Device enrolled
          </Badge>
        )}
        {enrolled === false && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <ShieldAlert className="h-3 w-3 text-warning" /> No device enrolled
          </Badge>
        )}
        {required && (
          <Badge variant="destructive" className="text-[11px]">Required for your role</Badge>
        )}
        {enrolled && aal2 === true && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <ShieldCheck className="h-3 w-3 text-success" /> Verified 2FA session
          </Badge>
        )}
        {enrolled && aal2 === false && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setStepUpOpen(true)}>
            Start verified 2FA session
          </Button>
        )}
      </div>

      <MfaStepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        action="managing your two-factor settings"
        onVerified={() => setAal2(true)}
      />

      {required && enrolled === false && (
        <Alert variant={inGrace ? "default" : "destructive"}>
          <Clock className="h-4 w-4" />
          <AlertTitle>
            {inGrace ? "Enrolment grace period active" : "Enrolment required now"}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {inGrace && policy?.grace_ends_at
              ? `Your role requires two-factor authentication. Enrol a device before ${formatDateTime(
                  policy.grace_ends_at,
                )} — after that you will be asked to enrol before you can continue.`
              : "Your role requires two-factor authentication. Enrol an authenticator device below to keep access to restricted modules."}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        You can set up, reset or replace your authenticator device yourself at any time. Removing a
        device and setting it up again issues a fresh secret — generate new backup codes afterwards
        and store them somewhere safe.
      </p>

      <TwoFactorSetup />
    </div>
  );
}
