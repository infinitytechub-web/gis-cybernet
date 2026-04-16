import { useState, useCallback } from "react";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";

import gisLogo from "@/assets/gis-logo.jpeg";

export default function Login() {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, setActiveTab] = useState("staff");
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
          description: "Too many failed attempts. Please wait 60 seconds or contact an administrator.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Look up the auth email from the Staff/Admin ID
      const { data: emailData, error: emailErr } = await supabase.rpc("get_email_by_staff_id", { _staff_id: trimmedId });
      if (emailErr || !emailData) {
        // Record as failed attempt to prevent enumeration timing attacks
        await supabase.rpc("record_failed_login", { _staff_id: trimmedId });
        throw new Error("Invalid ID or password");
      }

      try {
        await signIn(emailData as string, password);
        // Clear failed attempts on success
        await supabase.rpc("clear_failed_login_attempts", { _staff_id: trimmedId });
        navigate("/");
      } catch (signInErr) {
        // Record failed attempt server-side
        const { data: result } = await supabase.rpc("record_failed_login", { _staff_id: trimmedId });
        const r = result as { attempts?: number; locked?: boolean; remaining?: number } | null;
        if (r?.locked) {
          toast({
            title: "Account Temporarily Locked",
            description: "Too many failed attempts. Please wait 60 seconds or contact an administrator.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Login Failed",
            description: `Invalid Staff ID or password. ${r?.remaining ?? 0} attempts remaining.`,
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
            <img src={gisLogo} alt="Ghana Immigration Service" className="h-24 w-24 rounded-full object-cover mx-auto border-2 border-primary/30" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-secondary">Ghana Immigration Service</h1>
            <p className="text-sm text-muted-foreground">Amasaman Sector Command — Cybernet</p>
          </div>
        </CardHeader>
        <CardContent>
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
          <p className="text-xs text-center text-muted-foreground mt-6">
            Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
