import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PasswordStrength, getStrength } from "@/components/ui/password-strength";
import { toast } from "sonner";
import { ShieldAlert, KeyRound, Eye, EyeOff } from "lucide-react";
import gisLogo from "@/assets/gis-logo-192.webp";

type Method = "passphrase" | "backup_code";

export default function AdminRecovery() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("passphrase");
  const [staffId, setStaffId] = useState("");
  const [secret, setSecret] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim()) return toast.error("Enter your Admin Staff ID");
    if (!secret.trim()) return toast.error(method === "passphrase" ? "Enter the recovery passphrase" : "Enter a backup code");
    if (newPassword !== confirm) return toast.error("Passwords do not match");
    if (getStrength(newPassword) < 4) return toast.error("Password must be at least 'Strong' (12+ chars, mixed case, number, symbol).");

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-recovery", {
        body: {
          staff_id: staffId.trim(),
          method,
          secret: secret.trim(),
          new_password: newPassword,
        },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Recovery failed");
      setDone(true);
      toast.success("Password reset. You can now sign in.");
    } catch (err: any) {
      const msg = err?.context?.error || err?.message || "Recovery failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
        <Card className="w-full max-w-md border-primary/20 shadow-xl text-center">
          <CardContent className="py-12 space-y-4">
            <KeyRound className="h-12 w-12 mx-auto text-primary" />
            <h2 className="text-lg font-semibold text-secondary">Password Reset</h2>
            <p className="text-sm text-muted-foreground">
              Your administrator password has been updated. You will be asked to change it again on first login.
            </p>
            <Alert variant="default" className="text-left">
              <AlertDescription className="text-xs">
                Your account lockout (if any) was cleared automatically. You can sign in immediately with your new password.
              </AlertDescription>
            </Alert>
            <Button onClick={() => navigate("/login")} className="w-full">Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-muted p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <img src={gisLogo} alt="GIS" width={80} height={80} className="h-20 w-20 rounded-full object-cover mx-auto border-2 border-primary/30" />
          <div>
            <h1 className="text-xl font-bold text-secondary flex items-center gap-2 justify-center">
              <ShieldAlert className="h-5 w-5" /> Admin Recovery
            </h1>
            <p className="text-sm text-muted-foreground">Restore administrator access without email</p>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-amber-500/40 bg-amber-500/5">
            <AlertTitle className="text-sm">Administrator only</AlertTitle>
            <AlertDescription className="text-xs">
              Every attempt is recorded with your IP and device. Misuse will trigger a security review.
              On success, the account lockout (if any) is cleared so you can sign in immediately.
            </AlertDescription>
          </Alert>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-staff">Admin Staff ID</Label>
              <Input id="rec-staff" placeholder="e.g. ADMIN-001" value={staffId} onChange={(e) => setStaffId(e.target.value)} required autoComplete="username" />
            </div>

            <Tabs value={method} onValueChange={(v) => { setMethod(v as Method); setSecret(""); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="passphrase">Passphrase</TabsTrigger>
                <TabsTrigger value="backup_code">Backup code</TabsTrigger>
              </TabsList>
              <TabsContent value="passphrase" className="space-y-2 pt-3">
                <Label htmlFor="rec-pass">Recovery passphrase</Label>
                <Input id="rec-pass" type="password" placeholder="Server-side passphrase" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
                <p className="text-[11px] text-muted-foreground">Held by the system administrator off-system.</p>
              </TabsContent>
              <TabsContent value="backup_code" className="space-y-2 pt-3">
                <Label htmlFor="rec-code">MFA backup code</Label>
                <Input id="rec-code" placeholder="xxxx-xxxx-xxxx" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
                <p className="text-[11px] text-muted-foreground">Any unused code from your saved backup list.</p>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="rec-new">New password</Label>
              <div className="relative">
                <Input
                  id="rec-new"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 12 chars, mixed case, number, symbol"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-confirm">Confirm new password</Label>
              <Input id="rec-confirm" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : "Reset Admin Password"}
            </Button>
            <div className="text-center">
              <Link to="/login" className="text-xs text-primary hover:underline">Back to login</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
