/**
 * Biometric Sign-In (passkeys) — self-service panel for every staff member.
 *
 * Enrols the current device's fingerprint / Face ID as a passkey. Only the
 * device's public key is stored — never a fingerprint, face image or template.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Fingerprint, ScanFace, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { biometricsAvailable, currentDeviceLabel, enrollBiometric, supportsWebAuthn } from "@/lib/webauthn";
import { formatDate } from "@/lib/date-format";

interface CredentialRow {
  id: string;
  device_label: string;
  backed_up: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Status {
  enabled: boolean;
  device_count: number;
  globally_enabled: boolean;
  consented_at: string | null;
}

export function BiometricSettings() {
  const { toast } = useToast();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: creds }, { data: st }] = await Promise.all([
      supabase.rpc("webauthn_list_my_credentials"),
      supabase.rpc("webauthn_my_status"),
    ]);
    setCredentials((creds as CredentialRow[]) ?? []);
    setStatus((st as unknown as Status) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void biometricsAvailable().then(setAvailable);
    void load();
  }, [load]);

  const handleEnroll = useCallback(async () => {
    setBusy(true);
    try {
      const label = await enrollBiometric(true, currentDeviceLabel());
      toast({ title: "Device enrolled", description: `${label} can now sign you in with biometrics.` });
      setConsent(false);
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

  const handleRevoke = useCallback(async (id: string, label: string) => {
    const { error } = await supabase.rpc("webauthn_revoke_credential", {
      _id: id,
      _reason: "Removed by the account owner",
    });
    if (error) {
      toast({ title: "Could not remove device", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Device removed", description: `${label} can no longer sign in with biometrics.` });
    await load();
  }, [load, toast]);

  const handleToggle = useCallback(async (next: boolean) => {
    const { error } = await supabase.rpc("webauthn_set_enabled", { _enabled: next, _consent: next });
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Biometric sign-in enabled" : "Biometric sign-in disabled",
      description: next
        ? "You can sign in with fingerprint or Face ID on your enrolled devices."
        : "Password sign-in is still available as normal.",
    });
    await load();
  }, [load, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
          Biometric Sign-In
        </CardTitle>
        <CardDescription>
          Use your device's fingerprint or Face ID instead of typing your password. Your biometrics
          never leave your device — only a cryptographic key is registered with the system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status && !status.globally_enabled && (
          <Alert variant="destructive">
            <AlertTitle>Disabled organisation-wide</AlertTitle>
            <AlertDescription>
              An administrator has turned biometric sign-in off for the whole system.
            </AlertDescription>
          </Alert>
        )}

        {available === false && (
          <Alert>
            <AlertTitle>Not available on this device</AlertTitle>
            <AlertDescription>
              {supportsWebAuthn()
                ? "This device has no fingerprint, Face ID or Windows Hello authenticator. Password sign-in continues to work normally."
                : "This browser does not support passkeys. Password sign-in continues to work normally."}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="space-y-1">
            <Label htmlFor="biometric-toggle" className="font-medium">Allow biometric sign-in</Label>
            <p className="text-sm text-muted-foreground">
              Turning this off blocks biometric sign-in on every device, even enrolled ones.
            </p>
          </div>
          <Switch
            id="biometric-toggle"
            checked={!!status?.enabled}
            onCheckedChange={handleToggle}
            disabled={loading}
            aria-label="Allow biometric sign-in"
          />
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-2 font-medium">
            <ScanFace className="h-4 w-4 text-primary" aria-hidden="true" />
            Enrol this device
          </div>
          <p className="text-sm text-muted-foreground">
            {currentDeviceLabel()} will be registered to your account. Each phone or computer must be
            enrolled separately.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="biometric-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              disabled={available === false}
            />
            <Label htmlFor="biometric-consent" className="text-sm font-normal leading-snug">
              I consent to registering this device for biometric sign-in. I understand the system
              stores only a cryptographic key, never my fingerprint or face data, and that I can
              remove this device at any time.
            </Label>
          </div>
          <Button onClick={handleEnroll} disabled={!consent || busy || available === false}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />}
            {busy ? "Waiting for your device…" : "Enrol this device"}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Enrolled devices
            <Badge variant="secondary">{credentials.length}</Badge>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices enrolled yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {credentials.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.device_label}</p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {formatDate(c.created_at)}
                      {c.last_used_at ? ` · Last used ${formatDate(c.last_used_at)}` : " · Never used"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(c.id, c.device_label)}
                    aria-label={`Remove ${c.device_label}`}
                  >
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default BiometricSettings;
