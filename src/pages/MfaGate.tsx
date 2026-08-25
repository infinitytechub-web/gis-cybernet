import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Shield, Smartphone, LogOut, KeyRound, ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import QRCode from "qrcode";
import { getMyClientIp } from "@/lib/client-ip";

/**
 * Mandatory 2FA gate for system administrators.
 *  - First-time admins are forced to enrol a TOTP authenticator app.
 *  - On every subsequent login, admins must complete the TOTP challenge
 *    (Supabase upgrades the session to AAL2 after a successful verify).
 */
export default function MfaGate() {
  const { user, isAdmin, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname ?? "/dashboard";

  const [phase, setPhase] = useState<"loading" | "verify" | "enroll" | "verify-enrol" | "enroll-help" | "recovery">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const cleanupUnverifiedFactors = async (): Promise<number> => {
    let removed = 0;
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.totp ?? []) {
        if (f.status !== "verified") {
          try {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
            removed += 1;
          } catch { /* best effort */ }
        }
      }
    } catch { /* best effort */ }
    return removed;
  };

  useEffect(() => {
    if (!user) return;
    // If the admin still owes a password change (e.g. recovery temp password),
    // route them through the change-password flow before the MFA gate so they
    // can rotate the secret first.
    if ((user as any)?.user_metadata?.must_change_password === true) {
      navigate("/change-password", { replace: true });
      return;
    }
    (async () => {
      // MFA requirement is policy-driven (Security Settings → Access Policy):
      // a role only becomes mandatory once its enrolment grace period ends.
      const { data: policy } = await (supabase as any).rpc("my_mfa_policy");
      const p = (policy ?? null) as { required?: boolean; in_grace?: boolean } | null;
      const required = p ? p.required === true && p.in_grace !== true : isAdmin;
      if (!required) {
        navigate(from, { replace: true });
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        navigate(from, { replace: true });
        return;
      }
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = data?.totp?.find((f: any) => f.status === "verified");
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setPhase("verify");
      } else {
        await cleanupUnverifiedFactors();
        setPhase("enroll");
      }
    })();
  }, [user, isAdmin, navigate, from]);


  useEffect(() => {
    if (!qrCanvasRef.current || !qrUri || phase !== "verify-enrol") return;
    QRCode.toCanvas(qrCanvasRef.current, qrUri, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    }).catch(() => {
      toast.error("Could not render QR code. Use the manual key instead.");
    });
  }, [phase, qrUri]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Requirement is resolved by policy in the effect above (which redirects
  // users whose role is exempt or still inside its enrolment grace period).


  const buildFriendlyName = () => {
    const iso = new Date().toISOString().replace(/[:.]/g, "-");
    let token = Math.random().toString(36).slice(2, 10);
    try {
      const uuid = (globalThis.crypto as any)?.randomUUID?.();
      if (uuid) token = String(uuid).slice(0, 8);
    } catch { /* ignore */ }
    return `GIS Cybernet Admin (${iso}-${token})`;
  };

  const tryEnrolOnce = async () => {
    return await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: buildFriendlyName(),
    });
  };

  const handleEnrol = async () => {
    setBusy(true);
    // Wipe any stale state from a previous attempt before starting fresh.
    setFactorId(null);
    setQrUri(null);
    setSecret(null);
    setCode("");
    try {
      await cleanupUnverifiedFactors();
      let { data, error } = await tryEnrolOnce();
      if (error) {
        const msg = error.message || "";
        const recoverable = /already exists|friendly.?name|unverified|duplicate/i.test(msg);
        if (recoverable) {
          console.warn("[MfaGate] enrol collision, auto-cleaning and retrying:", msg);
          await cleanupUnverifiedFactors();
          ({ data, error } = await tryEnrolOnce());
        }
        if (error) throw error;
      }
      setFactorId(data!.id);
      setQrUri(data!.totp.uri);
      setSecret(data!.totp.secret);
      setPhase("verify-enrol");
    } catch (e: any) {
      console.warn("[MfaGate] enrol failed:", e?.message);
      toast.error("Could not start 2FA setup. Tap Regenerate to try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      if (factorId) {
        try { await supabase.auth.mfa.unenroll({ factorId }); } catch { /* ignore */ }
      }
      await cleanupUnverifiedFactors();
    } finally {
      setBusy(false);
    }
    await handleEnrol();
  };

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
    const fpPromise = getDeviceFingerprint().catch(() => null);
    const ipPromise = getMyClientIp();
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: ch.id, code,
      });
      if (vErr) throw vErr;
      const [fp, ip] = await Promise.all([fpPromise, ipPromise]);
      void supabase.rpc("record_mfa_challenge", {
        _outcome: "success",
        _factor_id: factorId,
        _ip_address: ip,
        _device_fingerprint: fp,
        _user_agent: ua,
      });
      toast.success("Verification successful");
      navigate(from, { replace: true });
    } catch (e: any) {
      const reason = e?.message || "Invalid code";
      const [fp, ip] = await Promise.all([fpPromise, ipPromise]);
      void supabase.rpc("record_mfa_challenge", {
        _outcome: "failure",
        _failure_reason: reason,
        _factor_id: factorId,
        _ip_address: ip,
        _device_fingerprint: fp,
        _user_agent: ua,
      });
      toast.error(reason);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleRecovery = async () => {
    const trimmed = recoveryCode.trim();
    if (trimmed.length < 8) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_consume_backup_code", { _code: trimmed });
      if (error) throw error;
      if (!data) {
        toast.error("Invalid or already-used recovery code");
        setRecoveryCode("");
        return;
      }
      // Recovery succeeded — remove the lost authenticator and force re-enrolment
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.totp ?? []) {
        try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch {}
      }
      toast.success("Recovery code accepted. Enrol a new authenticator to continue.");
      setFactorId(null);
      setQrUri(null);
      setSecret(null);
      setCode("");
      setRecoveryCode("");
      setPhase("enroll");
    } catch (e: any) {
      toast.error(e.message || "Recovery failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
            <Shield className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>Administrator Two-Factor Authentication</CardTitle>
          <Badge variant="outline" className="mx-auto text-[10px] border-destructive/40 text-destructive">
            Mandatory for Admin accounts
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "loading" && (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}

          {phase === "enroll" && (
            <>
              <p className="text-sm text-muted-foreground">
                For security, every administrator must protect their account with an authenticator app
                (Google Authenticator, Authy, 1Password, etc.) before accessing the system.
              </p>
              <Button onClick={handleEnrol} disabled={busy} className="w-full gap-2">
                <Smartphone className="h-4 w-4" />
                {busy ? "Preparing…" : "Set up authenticator app"}
              </Button>
            </>
          )}

          {phase === "verify-enrol" && qrUri && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Scan this QR code with your authenticator app, then enter the 6-digit code below.
              </p>
              <div className="bg-white p-4 rounded-lg flex justify-center">
                <canvas
                  ref={qrCanvasRef}
                  width={200}
                  height={200}
                  aria-label="2FA QR code"
                  className="h-[200px] w-[200px]"
                />
              </div>
              <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                For your protection, the secret key is never displayed. Scan the QR code above with
                Google Authenticator, Authy, or 1Password to enrol this device.
              </p>
              <div>
                <Label className="text-xs">6-digit code from your app</Label>
                <div className="flex justify-center mt-2">
                  <InputOTP maxLength={6} value={code} onChange={setCode}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <Button onClick={handleVerify} disabled={busy || code.length !== 6} className="w-full">
                {busy ? "Verifying…" : "Confirm & continue"}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 text-muted-foreground"
                  onClick={handleRegenerate}
                  disabled={busy}
                >
                  <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                  Regenerate code
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-2 text-xs gap-1"
                  onClick={() => setPhase("enroll-help")}
                  disabled={busy}
                >
                  <ShieldAlert className="h-3 w-3" />
                  Can't scan the QR?
                </Button>
              </div>
            </div>
          )}

          {phase === "enroll-help" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">The setup secret is hidden by design.</p>
                <p>
                  Showing the raw key in chat or on screen would let anyone glancing at this device
                  enrol their own authenticator. Pick one of the safe options below instead.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                <li>Open your authenticator app on a phone and tap <strong>Scan QR code</strong>, then point the camera at the QR on the previous screen.</li>
                <li>If you previously enrolled and saved recovery codes, use one of them — it will let you re-enrol cleanly.</li>
                <li>If neither option works, sign out and ask another administrator to reset your 2FA from the Admin Settings page.</li>
              </ul>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPhase("verify-enrol")}
                  disabled={busy || !qrUri}
                  className="w-full gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to QR code
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setRecoveryCode(""); setPhase("recovery"); }}
                  disabled={busy}
                  className="w-full gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  Use a recovery code
                </Button>
              </div>
            </div>
          )}

          {phase === "verify" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter the 6-digit code from your authenticator app to continue.
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={handleVerify} disabled={busy || code.length !== 6} className="w-full">
                {busy ? "Verifying…" : "Verify"}
              </Button>
              <div className="text-center">
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => { setRecoveryCode(""); setPhase("recovery"); }}
                >
                  <KeyRound className="h-3 w-3" />
                  Lost your authenticator? Use a recovery code
                </Button>
              </div>
            </div>
          )}

          {phase === "recovery" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter one of the one-time recovery codes you saved when setting up 2FA.
                Each code can only be used once and will let you enrol a new authenticator.
              </p>
              <div>
                <Label className="text-xs">Recovery code</Label>
                <Input
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="e.g. ABCD-EFGH-1234"
                  className="mt-2 font-mono tracking-wider text-center"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleRecovery}
                disabled={busy || recoveryCode.trim().length < 8}
                className="w-full"
              >
                {busy ? "Verifying…" : "Use recovery code"}
              </Button>
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => { setRecoveryCode(""); setCode(""); setPhase("verify"); }}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to authenticator code
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
