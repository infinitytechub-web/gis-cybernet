import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Shield, Smartphone, LogOut, KeyRound, ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import QRCode from "qrcode";

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

  const [phase, setPhase] = useState<"loading" | "verify" | "enroll" | "verify-enrol" | "recovery">("loading");
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
    if (!user || !isAdmin) return;
    // If the admin still owes a password change (e.g. recovery temp password),
    // route them through the change-password flow before the MFA gate so they
    // can rotate the secret first.
    if ((user as any)?.user_metadata?.must_change_password === true) {
      navigate("/change-password", { replace: true });
      return;
    }
    (async () => {
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
  if (!isAdmin) return <Navigate to={from} replace />;

  const handleEnrol = async () => {
    setBusy(true);
    try {
      // Defensive: remove any lingering unverified factors so re-enrolment
      // doesn't collide with a stale friendly-name from a prior attempt.
      try {
        const { data: existing } = await supabase.auth.mfa.listFactors();
        for (const f of existing?.totp ?? []) {
          if (f.status !== "verified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
        }
      } catch { /* best effort */ }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `GIS Cybernet Admin (${new Date().toISOString().replace(/[:.]/g, "-")})`,
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrUri(data.totp.uri);
      setSecret(data.totp.secret);
      setPhase("verify-enrol");
    } catch (e: any) {
      toast.error(e.message || "Enrolment failed");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
    const fpPromise = getDeviceFingerprint().catch(() => null);
    const ipPromise = supabase.functions.invoke("client-ip-info")
      .then(({ data }) => (data as any)?.ip ?? null)
      .catch(() => null);
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

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Secret key copied");
    } catch {
      toast.error("Could not copy the secret key");
    }
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
              {secret && (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-center text-xs text-muted-foreground">Manual setup key</p>
                  <div className="flex items-center gap-2">
                    <Input value={secret} readOnly className="font-mono text-xs tracking-[0.18em]" aria-label="Manual setup key" />
                    <Button type="button" variant="outline" size="icon" onClick={handleCopySecret} aria-label="Copy manual setup key">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
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
