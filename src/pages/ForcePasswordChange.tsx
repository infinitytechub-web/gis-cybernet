import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { PasswordStrength, getStrength } from "@/components/ui/password-strength";
import gisLogo from "@/assets/gis-logo-192.webp";

export default function ForcePasswordChange() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (getStrength(password) < 4) {
      toast.error("Password must be at least 'Strong'. Add uppercase, lowercase, numbers, and special characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      // Update password
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;

      // Clear the flag
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { must_change_password: false },
      });
      if (metaErr) throw metaErr;

      toast.success("Password updated! Welcome to GIS HRM.");
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <img src={gisLogo} alt="GIS" width={80} height={80} decoding="async" className="h-20 w-20 rounded-full object-cover mx-auto border-2 border-primary/30" />
          <div>
            <h1 className="text-xl font-bold text-secondary flex items-center justify-center gap-2">
              <KeyRound className="h-5 w-5" /> Change Your Password
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              For security, you must set a new password before continuing.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pw">New Password</Label>
              <div className="relative">
                <Input id="new-pw" type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm Password</Label>
              <div className="relative">
                <Input id="confirm-pw" type={showConfirm ? "text" : "password"} placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Set Password & Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
