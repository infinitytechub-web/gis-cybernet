import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import gisLogo from "@/assets/gis-logo.jpeg";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;
// Use hCaptcha test key for development; replace with real site key in production
const HCAPTCHA_SITE_KEY = "10000000-ffff-ffff-ffff-000000000001";

export default function Login() {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const failCount = useRef(0);
  const captchaRef = useRef<HCaptcha>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const getRemainingLockout = useCallback(() => {
    if (!lockoutEnd) return 0;
    return Math.max(0, Math.ceil((lockoutEnd - Date.now()) / 1000));
  }, [lockoutEnd]);

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
    setCaptchaVerified(true);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken(null);
    setCaptchaVerified(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const remaining = getRemainingLockout();
    if (remaining > 0) {
      toast({ title: "Too many attempts", description: `Account temporarily locked. Try again in ${remaining} seconds.`, variant: "destructive" });
      return;
    }

    if (!captchaVerified || !captchaToken) {
      toast({ title: "Verification Required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }

    if (!staffId.trim() || !password.trim()) return;
    setIsLoading(true);
    try {
      // Verify hCaptcha token server-side
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-hcaptcha", {
        body: { token: captchaToken },
      });
      if (verifyError || !verifyData?.success) {
        toast({ title: "Verification Failed", description: "Human verification failed. Please try again.", variant: "destructive" });
        captchaRef.current?.resetCaptcha();
        setCaptchaVerified(false);
        setCaptchaToken(null);
        return;
      }

      const email = `${staffId.trim().toLowerCase().replace(/\s+/g, "")}@gis.local`;
      await signIn(email, password);
      failCount.current = 0;
      setLockoutEnd(null);
      navigate("/");
    } catch {
      failCount.current += 1;
      captchaRef.current?.resetCaptcha();
      setCaptchaVerified(false);
      setCaptchaToken(null);
      if (failCount.current >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutEnd(until);
        toast({ title: "Account Temporarily Locked", description: "Too many failed attempts. Please wait 60 seconds.", variant: "destructive" });
        setTimeout(() => { failCount.current = 0; setLockoutEnd(null); }, LOCKOUT_DURATION_MS);
      } else {
        toast({ title: "Login Failed", description: `Invalid Staff ID or password. ${MAX_ATTEMPTS - failCount.current} attempts remaining.`, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const LoginForm = ({ idLabel, idPlaceholder, buttonClass, buttonText }: { idLabel: string; idPlaceholder: string; buttonClass?: string; buttonText: string }) => (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label>{idLabel}</Label>
        <Input placeholder={idPlaceholder} value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* hCaptcha Widget */}
      <div className="flex flex-col items-center gap-2">
        <HCaptcha
          ref={captchaRef}
          sitekey={HCAPTCHA_SITE_KEY}
          onVerify={handleCaptchaVerify}
          onExpire={handleCaptchaExpire}
          onError={handleCaptchaExpire}
          size="compact"
        />
        {captchaVerified && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <ShieldCheck className="h-3 w-3" />
            <span>Human verified</span>
          </div>
        )}
      </div>

      <Button type="submit" className={`w-full ${buttonClass || ""}`} disabled={isLoading || getRemainingLockout() > 0 || !captchaVerified}>
        {isLoading ? "Signing in..." : getRemainingLockout() > 0 ? `Locked (${getRemainingLockout()}s)` : buttonText}
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
            <img src={gisLogo} alt="Ghana Immigration Service" className="h-24 w-24 rounded-full object-cover mx-auto border-2 border-primary/30" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-secondary">Ghana Immigration Service</h1>
            <p className="text-sm text-muted-foreground">Amasaman Sector Command — Cybernet</p>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="staff" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="staff" className="gap-2"><Users className="h-4 w-4" /> Staff</TabsTrigger>
              <TabsTrigger value="admin" className="gap-2"><Shield className="h-4 w-4" /> Admin</TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              <LoginForm idLabel="Staff / Service ID" idPlaceholder="Enter your Staff ID" buttonText="Sign In" />
            </TabsContent>
            <TabsContent value="admin">
              <LoginForm idLabel="Admin ID" idPlaceholder="Enter your Admin ID" buttonClass="bg-secondary hover:bg-secondary/90" buttonText="Admin Sign In" />
            </TabsContent>
          </Tabs>
          <p className="text-xs text-center text-muted-foreground mt-6">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
