/**
 * Staff-facing biometric self-enrollment page.
 *
 * Each staff member opens this page on the phone or computer they want to use
 * and enrols that device themselves. Enrollment can only happen on the device
 * itself — nobody, including administrators, can enrol a device remotely.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Fingerprint, ShieldAlert, ShieldCheck, Clock, Smartphone, LifeBuoy } from "lucide-react";
import { BiometricSettings } from "@/components/settings/BiometricSettings";
import { biometricsAvailable, currentDeviceLabel, supportsWebAuthn } from "@/lib/webauthn";
import { formatDate } from "@/lib/date-format";

interface EnrollmentStatus {
  policy_required: boolean;
  globally_enabled: boolean;
  grace_days: number;
  enforced_at: string | null;
  deadline: string | null;
  required_for_me: boolean;
  device_count: number;
  enrolled: boolean;
  days_left: number | null;
  overdue: boolean;
}

const TROUBLESHOOTING: { q: string; a: string }[] = [
  {
    q: "The \"Enrol this device\" button is greyed out",
    a: "Tick the consent checkbox first. If it stays disabled, this device has no fingerprint, Face ID, Windows Hello or screen-lock authenticator set up — add a device unlock method in your phone or computer settings, then reload this page.",
  },
  {
    q: "Nothing happened when I pressed Enrol",
    a: "Your browser may have blocked the prompt in a background tab. Keep this tab in the foreground, press Enrol again and respond to the device prompt within about a minute.",
  },
  {
    q: "I cancelled the prompt by mistake",
    a: "Nothing was saved. Press Enrol this device again and confirm with your fingerprint, face or device PIN.",
  },
  {
    q: "It says the device is already registered",
    a: "This device is already enrolled on your account. Check the Enrolled devices list below — if the entry looks wrong, remove it and enrol again.",
  },
  {
    q: "I use several phones or computers",
    a: "Every device must be enrolled separately from that device. Sign in on the other device with your Staff ID and password, open this page there and enrol it.",
  },
  {
    q: "I replaced or lost my device",
    a: "Remove the old entry in Enrolled devices below, then enrol the new device. If you can no longer sign in at all, ask an administrator to reset your biometric enrollment.",
  },
  {
    q: "Biometric sign-in is off for the whole system",
    a: "An administrator has disabled it centrally. Password sign-in keeps working; contact your administrator if you were asked to enrol.",
  },
  {
    q: "Will my fingerprint or face be stored?",
    a: "No. The check happens inside your device's secure hardware. Only a public cryptographic key and a device label are sent to the system — never an image or template.",
  },
];

export default function BiometricEnrollment() {
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("webauthn_my_enrollment_status");
    setStatus((data as unknown as EnrollmentStatus) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void biometricsAvailable().then(setAvailable);
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Fingerprint className="h-6 w-6 text-primary" aria-hidden="true" />
          Biometric Self-Enrollment
        </h1>
        <p className="text-muted-foreground">
          Register this device for fingerprint or Face ID sign-in. Enrollment must be done on each
          device you use — it cannot be completed for you by anyone else.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Your enrollment status
          </CardTitle>
          <CardDescription>Where you stand against the current enrollment policy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Checking your status…</p>
          ) : !status ? (
            <p className="text-sm text-muted-foreground">Status is unavailable right now.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status.enrolled ? (
                  <Badge className="gap-1"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Enrolled</Badge>
                ) : status.overdue ? (
                  <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" aria-hidden="true" />Overdue</Badge>
                ) : status.required_for_me ? (
                  <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" aria-hidden="true" />Enrollment required</Badge>
                ) : (
                  <Badge variant="outline">Optional for your role</Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Smartphone className="h-3 w-3" aria-hidden="true" />
                  {status.device_count} device{status.device_count === 1 ? "" : "s"} enrolled
                </Badge>
              </div>

              {status.required_for_me && !status.enrolled && (
                <Alert variant={status.overdue ? "destructive" : "default"}>
                  <AlertTitle>
                    {status.overdue
                      ? "Enrollment is overdue"
                      : `Enrol within ${status.days_left ?? 0} day${status.days_left === 1 ? "" : "s"}`}
                  </AlertTitle>
                  <AlertDescription>
                    {status.deadline
                      ? `Your role requires an enrolled device by ${formatDate(status.deadline)}.`
                      : "Your role requires at least one enrolled device."}
                    {status.overdue ? " You will be prompted on every sign-in until a device is enrolled." : ""}
                  </AlertDescription>
                </Alert>
              )}

              {available === false && (
                <Alert>
                  <AlertTitle>This device cannot be enrolled</AlertTitle>
                  <AlertDescription>
                    {supportsWebAuthn()
                      ? `${currentDeviceLabel()} has no fingerprint, Face ID or Windows Hello authenticator set up. Add a device unlock method, then reload this page.`
                      : "This browser does not support passkeys. Try the latest Chrome, Edge, Safari or Firefox on a device with a screen lock."}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <BiometricSettings />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="h-5 w-5 text-primary" aria-hidden="true" />
            Troubleshooting
          </CardTitle>
          <CardDescription>Common enrollment problems and how to resolve them.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {TROUBLESHOOTING.map((item, i) => (
              <AccordionItem key={item.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-4 text-sm text-muted-foreground">
            Still stuck? Password sign-in always remains available. Contact a System Administrator to
            reset your biometric enrollment if you have lost every enrolled device.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
