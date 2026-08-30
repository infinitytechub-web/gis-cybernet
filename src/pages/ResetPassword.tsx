import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, CheckCircle } from "lucide-react";
import { PasswordStrength, getStrength } from "@/components/ui/password-strength";
import gisLogo from "@/assets/gis-logo-192.webp";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function ResetPassword() {
  usePageMeta({
    title: "Set a New Password — Cybernet HRM System",
    description:
      "Set a new password for your Cybernet HRM System account. Passwords must meet Ghana Immigration Service security strength requirements before they are accepted.",
    path: "/reset-password",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event from the auth link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check hash for type=recovery (Supabase redirects with hash params)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated successfully");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isRecovery && !done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
        <Card className="w-full max-w-md border-primary/20 shadow-xl text-center">
          <CardContent className="py-12 space-y-4">
            <KeyRound className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold text-secondary">Verifying reset link...</h2>
            <p className="text-sm text-muted-foreground">If this page doesn't update, the link may be expired or invalid.</p>
            <Button variant="outline" onClick={() => navigate("/login")}>Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
        <Card className="w-full max-w-md border-primary/20 shadow-xl text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-primary" />
            <h2 className="text-lg font-semibold text-secondary">Password Updated!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to login...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <img src={gisLogo} alt="GIS" width={80} height={80} decoding="async" className="h-20 w-20 rounded-full object-cover mx-auto border-2 border-primary/30" />
          <div>
            <h1 className="text-xl font-bold text-secondary">Set New Password</h1>
            <p className="text-sm text-muted-foreground">Enter your new password below</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" placeholder="Minimum 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <PasswordStrength password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input id="confirm-password" type="password" placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
