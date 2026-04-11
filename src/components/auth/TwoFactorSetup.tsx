import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Smartphone, Mail, Check, X, QrCode } from "lucide-react";
import { toast } from "sonner";

export default function TwoFactorSetup() {
  const { user } = useAuth();
  const [totpEnrolled, setTotpEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    checkFactors();
  }, []);

  const checkFactors = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp && data.totp.length > 0) {
      setTotpEnrolled(true);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GIS Cybernet Auth",
      });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!factorId || verifyCode.length !== 6) return;
    setVerifying(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      toast.success("Authenticator app configured successfully!");
      setTotpEnrolled(true);
      setQrUri(null);
      setSecret(null);
      setFactorId(null);
      setVerifyCode("");
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleUnenroll = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.[0];
      if (factor) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
        setTotpEnrolled(false);
        toast.success("Authenticator app removed");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-primary" />
          Two-Factor Authentication (2FA)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* TOTP (Authenticator App) */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">Authenticator App</div>
              <p className="text-xs text-muted-foreground">Google Authenticator, Authy, etc.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totpEnrolled ? (
              <>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
                <Button variant="outline" size="sm" onClick={handleUnenroll}>Remove</Button>
              </>
            ) : (
              <Button size="sm" onClick={handleEnroll} disabled={enrolling}>
                {enrolling ? "Setting up..." : "Set Up"}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code Enrollment */}
        {qrUri && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="text-center">
              <p className="text-sm font-medium mb-2">Scan this QR code with your authenticator app</p>
              <div className="bg-white p-4 rounded-lg inline-block">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>
            {secret && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Or enter this key manually:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded select-all">{secret}</code>
              </div>
            )}
            <div>
              <Label className="text-sm">Enter the 6-digit code from your app to confirm:</Label>
              <div className="flex justify-center mt-2">
                <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
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
              <Button onClick={handleVerifyEnrollment} className="w-full mt-3" disabled={verifying || verifyCode.length !== 6}>
                {verifying ? "Verifying..." : "Confirm Setup"}
              </Button>
            </div>
          </div>
        )}

        {/* Email OTP Info */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">Email/Notification OTP</div>
              <p className="text-xs text-muted-foreground">One-time code via system notification</p>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-800">Auto-enabled</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Two-factor authentication adds an extra layer of security. After entering your password, you'll need to provide a second verification code.
        </p>
      </CardContent>
    </Card>
  );
}
