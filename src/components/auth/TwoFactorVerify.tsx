import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Smartphone, Mail } from "lucide-react";
import { toast } from "sonner";

interface TwoFactorVerifyProps {
  onVerified: () => void;
  method: "totp" | "email";
}

export default function TwoFactorVerify({ onVerified, method }: TwoFactorVerifyProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      if (method === "totp") {
        // Use Supabase MFA verification
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp?.[0];
        if (!totpFactor) { toast.error("No authenticator app configured"); return; }

        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (challengeError) throw challengeError;

        const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: totpFactor.id, challengeId: challenge.id, code });
        if (verifyError) throw verifyError;
      } else {
        // Email OTP verification via server-side hashed comparison
        const { data: verified, error } = await supabase.rpc("verify_otp", { _code: code });
        if (error || !verified) { toast.error("Invalid or expired code"); return; }
      }

      toast.success("Verification successful");
      onVerified();
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
            {method === "totp" ? <Smartphone className="h-8 w-8 text-primary" /> : <Mail className="h-8 w-8 text-primary" />}
          </div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <p className="text-sm text-muted-foreground">
            {method === "totp"
              ? "Enter the 6-digit code from your authenticator app"
              : "Enter the 6-digit code sent to your registered contact"}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={handleVerify} className="w-full" disabled={loading || code.length !== 6}>
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
