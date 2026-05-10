import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Shield, Smartphone, LogOut, KeyRound, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!user || !isAdmin) return;
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
        // Clean up stale unverified factors before enrolling fresh
        for (const f of data?.totp ?? []) {
          if (f.status !== "verified") {
            try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch {}
          }
        }
        setPhase("enroll");
      }
    })();
  }, [user, isAdmin, navigate, from]);

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
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `GIS Cybernet Admin (${new Date().toISOString().slice(0, 10)})`,
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
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: ch.id, code,
      });
      if (vErr) throw vErr;
      toast.success("Verification successful");
      navigate(from, { replace: true });
    } catch (e: any) {
      toast.error(e.message || "Invalid code");
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
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                  alt="2FA QR Code" width={200} height={200}
                />
              </div>
              {secret && (
                <p className="text-center text-xs text-muted-foreground">
                  Or enter this key manually: <code className="bg-muted px-1.5 py-0.5 rounded select-all">{secret}</code>
                </p>
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
