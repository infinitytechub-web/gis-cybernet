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
import { Shield, Users, Eye, EyeOff, KeyRound, ArrowLeft, Fingerprint, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getMyClientIp } from "@/lib/client-ip";
import { getTrustedMac } from "@/lib/trusted-mac";
import { biometricLogin, biometricsAvailable } from "@/lib/webauthn";
import { executeRecaptcha, getRecaptchaConfig, preloadRecaptcha } from "@/lib/recaptcha";

// Use public path so the preload <link> in index.html matches the actual request URL (LCP optimisation)
const gisLogo = "/gis-logo-192.webp";
import { useBranding } from "@/hooks/useBranding";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function Login() {
  const branding = useBranding();
  usePageMeta({
    title: "Staff Sign In — GAR-ASC-Cybernet HRM",
    description:
      "Secure staff sign-in for the GAR-ASC-Cybernet HRM system. Authorised Ghana Immigration Service personnel can access rosters, attendance and operations records.",
    path: "/login",
  });

  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, setActiveTab] = useState("staff");
  const [mfaStep, setMfaStep] = useState<null | "totp">(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [canBiometric, setCanBiometric] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [captchaActive, setCaptchaActive] = useState(false);
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

  // Invisible bot protection (reCAPTCHA v3). Warm the script up so the first
  // sign-in is not delayed, and show the required Google attribution notice.
  useEffect(() => {
    void getRecaptchaConfig().then((c) => {
      setCaptchaActive(c.enabled);
      if (c.enabled) preloadRecaptcha();
    });
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

      // Lockout state is checked together with the ID lookup below (the
      // lockout RPCs are not callable anonymously, so the hardened edge
      // function performs them with elevated privileges).


      // Best-effort client IP lookup (cached per session — used by admin alert trigger)
      const clientIp: string | null = await getMyClientIp();

      // Device fingerprint for block check
      const fingerprint = await getDeviceFingerprint();
      // Trusted MAC, if a controlled context (kiosk/MDM/VPN agent) injected one.
      const trustedMac = getTrustedMac();

      // Block check (IP, device fingerprint, and/or trusted MAC)
      if (clientIp || fingerprint || trustedMac) {
        const { data: blocked } = await supabase.rpc("is_ip_blocked", {
          _ip: clientIp ?? "",
          _fingerprint: fingerprint || null,
          _mac: trustedMac,
        } as any);
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

      // Invisible reCAPTCHA v3 token (null when protection is switched off).
      const captchaToken = await executeRecaptcha("login");

      // Look up the auth email from the Staff/Admin ID via the hardened edge
      // function (rate-limited, audited, captcha-gated, no direct anon DB access).
      const { data: lookupData, error: lookupErr } = await supabase.functions.invoke(
        "resolve-staff-email",
        { body: { staff_id: trimmedId, recaptcha_token: captchaToken } },
      );
      const lookup = (lookupData ?? null) as
        | {
            email?: string;
            locked?: boolean;
            threshold?: number | null;
            auto_unlock_minutes?: number | null;
            error?: string;
          }
        | null;
      const emailData = lookup?.email ?? null;

      // The edge function answers 403 with a captcha message when the request
      // looks automated. On a non-2xx status invoke() puts the body on the
      // error context, so check both places.
      let captchaMessage: string | null =
        typeof lookup?.error === "string" && /verification|automated/i.test(lookup.error)
          ? lookup.error
          : null;
      if (!captchaMessage && lookupErr) {
        try {
          const res = (lookupErr as { context?: Response }).context;
          if (res && typeof res.json === "function") {
            const payload = await res.clone().json();
            if (res.status === 403 && typeof payload?.error === "string") captchaMessage = payload.error;
          }
        } catch { /* fall through to the generic message */ }
      }
      if (captchaMessage) {
        toast({ title: "Verification failed", description: captchaMessage, variant: "destructive" });
        throw new Error("Captcha rejected");
      }


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


      // Policy-driven lockout: refuse the attempt outright while locked.
      if (lookup?.locked) {
        toast({
          title: "Account Locked",
          description: lookup.auto_unlock_minutes
            ? `Too many failed attempts. Try again in ${lookup.auto_unlock_minutes} minute${lookup.auto_unlock_minutes === 1 ? "" : "s"}.`
            : "Too many failed attempts. Contact an administrator to unlock this account.",
          variant: "destructive",
        });
        throw new Error("Account locked");
      }

      try {
        await signIn(emailData as string, password);
        // Clear failed attempts on success (service-role side — anon cannot
        // execute the lockout RPCs directly).
        await supabase.functions.invoke("resolve-staff-email", {
          body: { staff_id: trimmedId, action: "clear_failures" },
        });

        // Admins are required to complete 2FA after primary authentication.
        // Non-admins continue straight to the app shell.
        const { data: roleRows, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .eq("role", "admin");

        // If the admin was issued a temporary password (e.g. via recovery),
        // force them through the password change first so they aren't blocked
        // by the MFA enrolment gate before they can rotate the temp secret.
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        const mustChangePw = freshUser?.user_metadata?.must_change_password === true;

        if (mustChangePw) {
          navigate("/change-password", { replace: true });
        } else if (!roleErr && (roleRows?.length ?? 0) > 0) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      } catch (signInErr) {
        // Record failed attempt server-side, against the configured policy.
        const { data: failData } = await supabase.functions.invoke("resolve-staff-email", {
          body: { staff_id: trimmedId, action: "record_failure" },
        });
        const r = (failData ?? null) as { attempts?: number; locked?: boolean; remaining?: number } | null;
        const threshold = lookup?.threshold ?? null;
        if (r?.locked) {
          toast({
            title: "Account Locked",
            description: threshold
              ? `Account locked after ${threshold} failed attempts. Contact an administrator to unlock.`
              : "Account locked after too many failed attempts. Contact an administrator to unlock.",
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
    const ipPromise = getMyClientIp();
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

  // ---- Biometric (WebAuthn / FIDO2 passkey) sign-in ---------------------
  // The device performs the fingerprint / Face ID check locally; only a signed
  // assertion reaches the server. Falls back to the password form whenever the
  // device, browser or account cannot use biometrics.
  useEffect(() => {
    void biometricsAvailable().then(setCanBiometric);
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    const trimmedId = staffId.trim();
    if (!trimmedId) {
      toast({
        title: "Enter your ID first",
        description: "Type your Staff/Admin ID, then use biometric sign-in.",
      });
      return;
    }
    setBioLoading(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    try {
      const fp = await getDeviceFingerprint().catch(() => null);
      const result = await biometricLogin(trimmedId, fp);

      if (result.status === "not_enrolled") {
        toast({
          title: "No biometric device registered",
          description: "Sign in with your password, then enrol this device under My Profile → Biometric sign-in.",
        });
        return;
      }
      if (result.status === "cancelled") return;

      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: result.tokenHash,
      });
      if (error) throw error;

      await supabase.rpc("clear_failed_login_attempts", { _staff_id: trimmedId });

      if (result.mfaSatisfied) {
        const ip = await getMyClientIp();
        void supabase.rpc("record_mfa_challenge", {
          _outcome: "success",
          _factor_id: "webauthn",
          _staff_id: trimmedId,
          _ip_address: ip,
          _device_fingerprint: fp,
          _user_agent: ua,
        });
      }

      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (freshUser?.user_metadata?.must_change_password === true) {
        navigate("/change-password", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e: any) {
      toast({
        title: "Biometric sign-in failed",
        description: e?.message || "Use your password instead.",
        variant: "destructive",
      });
    } finally {
      setBioLoading(false);
    }
  }, [staffId, navigate, toast]);


  const renderLoginForm = (idLabel: string, idPlaceholder: string, buttonClass?: string, buttonText?: string, mode: "staff" | "admin" = "staff") => {
    const idFieldId = `login-${mode}-id`;
    const pwFieldId = `login-${mode}-password`;
    return (
    <form onSubmit={handleLogin} className="space-y-4" aria-label={`${mode === "admin" ? "Administrator" : "Staff"} sign-in form`}>
      <div className="space-y-2">
        <Label htmlFor={idFieldId}>{idLabel}</Label>
        <Input id={idFieldId} placeholder={idPlaceholder} value={staffId} onChange={(e) => setStaffId(e.target.value)} required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={pwFieldId}>Password</Label>
        <div className="relative">
          <Input id={pwFieldId} type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" autoComplete="current-password" />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      <Button type="submit" className={`w-full ${buttonClass || ""}`} disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Signing in..." : (buttonText || "Sign In")}
      </Button>
      {canBiometric && (
        <>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleBiometricLogin}
            disabled={bioLoading || isLoading}
            aria-busy={bioLoading}
          >
            {bioLoading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Fingerprint className="h-4 w-4" aria-hidden="true" />}
            {bioLoading ? "Waiting for your device…" : "Sign in with fingerprint or Face ID"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Uses this device's secure biometrics. No fingerprint or face data leaves your device.
          </p>
        </>
      )}
      <div className="text-center space-y-1">
        <ForgotPasswordDialog />
        <div>
          <a href="/admin-recovery" className="text-xs text-foreground hover:text-primary hover:underline">
            Administrator account locked? Use Admin Recovery
          </a>
        </div>
      </div>
      {captchaActive && (
        <p className="text-center text-[10px] leading-snug text-muted-foreground">
          Protected by reCAPTCHA — this site is checked for automated sign-in attempts. Google's{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline">
            Terms
          </a>{" "}
          apply.
        </p>
      )}
    </form>
    );
  };

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-accent via-background to-muted bg-cover bg-center p-4"
      style={branding.login_background_url ? { backgroundImage: `url(${branding.login_background_url})` } : undefined}
      aria-labelledby="login-heading"
    >
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto">
            <img src={branding.login_logo_url || branding.logo_url || gisLogo} alt={branding.company_name} width={96} height={96} decoding="async" {...({ fetchpriority: "high" } as Record<string, string>)} className="h-24 w-24 rounded-full object-cover mx-auto border-2 border-primary/30" />
          </div>
          <div>
            <h1 id="login-heading" className="text-xl font-bold text-secondary">
              {branding.company_name} — {branding.system_label || "HRM System"}
            </h1>
            <p className="text-sm text-muted-foreground">{branding.org_name} {branding.system_label}</p>

            {branding.login_tagline && (
              <p className="mt-1 text-xs text-muted-foreground">{branding.login_tagline}</p>
            )}
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
              {renderLoginForm("Staff / Service ID", "Enter your Staff ID", undefined, undefined, "staff")}
            </TabsContent>
            <TabsContent value="admin">
              {renderLoginForm("Admin ID", "Enter your Admin ID", "bg-secondary hover:bg-secondary/90", "Admin Sign In", "admin")}
            </TabsContent>
          </Tabs>
          )}
          <p className="text-xs text-center text-muted-foreground mt-6">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
