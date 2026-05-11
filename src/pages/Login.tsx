import { useState, useCallback, useEffect } from "react";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Eye, EyeOff, KeyRound, ArrowLeft } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

// Use public path so the preload <link> in index.html matches the actual request URL (LCP optimisation)
const gisLogo = "/gis-logo-192.webp";

export default function Login() {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, setActiveTab] = useState("staff");
  const [mfaStep, setMfaStep] = useState<null | "totp">(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const { signIn, signOut, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Idle-time prefetch of the post-login Dashboard chunk so navigation after
  // sign-in is instant. No UI impact; runs only when the browser is idle.
  useEffect(() => {
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cic: (id: number) => void =
      (window as any).cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));
    const handle = ric(() => {
      void import("./Dashboard");
      void import("@/components/Layout");
    });
    return () => cic(handle);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim() || !password.trim()) return;
    setIsLoading(true);
    try {
      const trimmedId = staffId.trim();

      // Check server-side lockout first
      const { data: locked } = await supabase.rpc("is_staff_locked", { _staff_id: trimmedId });
      if (locked === true) {
        toast({
          title: "Account Locked",
          description: "This account is locked. Please contact an administrator to unlock it.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Best-effort client IP lookup (used by admin alert trigger)
      let clientIp: string | null = null;
      try {
        const { data } = await supabase.functions.invoke("client-ip-info");
        clientIp = (data as any)?.ip ?? null;
      } catch { /* ignore network errors */ }

      // Device fingerprint for block check
      const fingerprint = await getDeviceFingerprint();

      // Block check (IP and/or device fingerprint)
      if (clientIp || fingerprint) {
        const { data: blocked } = await supabase.rpc("is_ip_blocked", {
          _ip: clientIp ?? "",
          _fingerprint: fingerprint || null,
        });
        if (blocked === true) {
          toast({
            title: "Access Blocked",
            description: "This device or network has been temporarily blocked by an administrator.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      }

      // Look up the auth email from the Staff/Admin ID via the hardened edge
      // function (rate-limited, audited, no direct anon DB access).
      const { data: lookupData, error: lookupErr } = await supabase.functions.invoke(
        "resolve-staff-email",
        { body: { staff_id: trimmedId } },
      );
      const emailData = (lookupData as { email?: string } | null)?.email ?? null;
      if (lookupErr || !emailData) {
        // record_failed_login already logged inside the edge function — no
        // need to double-log here. Surface a toast so the user isn't stuck
        // staring at a silent form.
        toast({
          title: "Login Failed",
          description: "Invalid Staff/Admin ID or password. Please check the ID and try again.",
          variant: "destructive",
        });
        throw new Error("Invalid ID or password");
      }

      try {
        await signIn(emailData as string, password);
        // Clear failed attempts on success
        await supabase.rpc("clear_failed_login_attempts", { _staff_id: trimmedId });

        // Admins are required to complete 2FA after primary authentication.
        // Non-admins continue straight to the app shell.
        const { data: roleRows, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .eq("role", "admin");

        if (!roleErr && (roleRows?.length ?? 0) > 0) {
          navigate("/2fa", { replace: true, state: { from: { pathname: "/dashboard" } } });
        } else {
          navigate("/", { replace: true });
        }
      } catch (signInErr) {
        // Record failed attempt server-side
        const { data: result } = await supabase.rpc("record_failed_login", { _staff_id: trimmedId, _ip_address: clientIp });
        const r = result as { attempts?: number; locked?: boolean; remaining?: number } | null;
        if (r?.locked) {
          toast({
            title: "Account Locked",
            description: "Account locked after 3 failed attempts. Contact an administrator to unlock.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Login Failed",
            description: `Invalid Staff ID or password. ${r?.remaining ?? 0} attempt${(r?.remaining ?? 0) === 1 ? "" : "s"} remaining before lockout.`,
            variant: "destructive",
          });
        }
        throw signInErr;
      }
    } catch {
      // Suppressed; handled above
    } finally {
      setIsLoading(false);
    }
  }, [staffId, password, signIn, navigate, toast]);

  const handleVerifyOtp = useCallback(async () => {
    if (!mfaFactorId || otp.length !== 6) return;
    setIsLoading(true);
    // Resolve audit metadata in parallel
    const trimmedId = staffId.trim() || null;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const fpPromise = getDeviceFingerprint().catch(() => null);
    const ipPromise = supabase.functions.invoke("client-ip-info")
      .then(({ data }) => (data as any)?.ip ?? null)
      .catch(() => null);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: ch.id, code: otp,
      });
      if (vErr) throw vErr;
      // Audit success (best-effort)
      const [fp, ip] = await Promise.all([fpPromise, ipPromise]);
      void supabase.rpc("record_mfa_challenge", {
        _outcome: "success",
        _factor_id: mfaFactorId,
        _staff_id: trimmedId,
        _ip_address: ip,
        _device_fingerprint: fp,
        _user_agent: ua,
      });
      navigate("/");
    } catch (e: any) {
      const reason = e?.message || "Invalid code";
      const [fp, ip] = await Promise.all([fpPromise, ipPromise]);
      void supabase.rpc("record_mfa_challenge", {
        _outcome: "failure",
        _failure_reason: reason,
        _factor_id: mfaFactorId,
        _staff_id: trimmedId,
        _ip_address: ip,
        _device_fingerprint: fp,
        _user_agent: ua,
      });
      toast({ title: "Invalid code", description: reason, variant: "destructive" });
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  }, [mfaFactorId, otp, staffId, navigate, toast]);

  const handleCancelMfa = useCallback(async () => {
    try { await signOut(); } catch { /* ignore */ }
    setMfaStep(null);
    setMfaFactorId(null);
    setOtp("");
    setPassword("");
  }, [signOut]);

  const renderLoginForm = (idLabel: string, idPlaceholder: string, buttonClass?: string, buttonText?: string) => (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label>{idLabel}</Label>
        <Input placeholder={idPlaceholder} value={staffId} onChange={(e) => setStaffId(e.target.value)} required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" autoComplete="current-password" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      <Button type="submit" className={`w-full ${buttonClass || ""}`} disabled={isLoading}>
        {isLoading ? "Signing in..." : (buttonText || "Sign In")}
      </Button>
      <div className="text-center">
        <ForgotPasswordDialog />
      </div>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto">
            <img src={gisLogo} alt="Ghana Immigration Service" width={96} height={96} fetchPriority="high" decoding="async" className="h-24 w-24 rounded-full object-cover mx-auto border-2 border-primary/30" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-secondary">Ghana Immigration Service</h1>
            <p className="text-sm text-muted-foreground">Amasaman Sector Command — Cybernet</p>
          </div>
        </CardHeader>
        <CardContent>
          {mfaStep === "totp" ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-destructive/10 p-2.5 rounded-full">
                  <Shield className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-base font-semibold text-secondary">Two-Factor Authentication</h2>
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator app to finish signing in.
                </p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={handleVerifyOtp} disabled={isLoading || otp.length !== 6} className="w-full bg-secondary hover:bg-secondary/90">
                {isLoading ? "Verifying…" : "Verify & Sign In"}
              </Button>
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleCancelMfa}>
                  <ArrowLeft className="h-3 w-3" /> Back
                </Button>
                <Button type="button" variant="link" size="sm" className="gap-1 text-xs" onClick={() => navigate("/mfa-gate", { state: { from: { pathname: "/" } } })}>
                  <KeyRound className="h-3 w-3" /> Lost your authenticator?
                </Button>
              </div>
            </div>
          ) : (
          <Tabs defaultValue="staff" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="staff" className="gap-2"><Users className="h-4 w-4" /> Staff</TabsTrigger>
              <TabsTrigger value="admin" className="gap-2"><Shield className="h-4 w-4" /> Admin</TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              {renderLoginForm("Staff / Service ID", "Enter your Staff ID")}
            </TabsContent>
            <TabsContent value="admin">
              {renderLoginForm("Admin ID", "Enter your Admin ID", "bg-secondary hover:bg-secondary/90", "Admin Sign In")}
            </TabsContent>
          </Tabs>
          )}
          <p className="text-xs text-center text-muted-foreground mt-6">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
