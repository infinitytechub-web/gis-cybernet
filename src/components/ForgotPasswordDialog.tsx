import { useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export const ForgotPasswordDialog = forwardRef<HTMLButtonElement>((_, ref) => {
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim()) return;

    setIsLoading(true);
    try {
      const email = `${staffId.trim().toLowerCase().replace(/\s+/g, "")}@gis.local`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("If an account exists with this ID, a reset link has been sent.");
    } catch {
      setSent(true);
      toast.success("If an account exists with this ID, a reset link has been sent.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setStaffId("");
      setSent(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button ref={ref} type="button" className="text-xs text-primary hover:underline">
          Forgot password?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Reset Password
          </DialogTitle>
        </DialogHeader>
        {sent ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              If an account exists with this Staff ID, a password reset link has been sent to the associated email.
            </p>
            <p className="text-xs text-muted-foreground">Please check your inbox and follow the instructions.</p>
            <Button variant="outline" onClick={() => handleOpenChange(false)} className="mt-4">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-staff-id">Staff / Service ID</Label>
              <Input
                id="reset-staff-id"
                placeholder="Enter your Staff ID"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A password reset link will be sent to the email associated with your account.
            </p>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
});

ForgotPasswordDialog.displayName = "ForgotPasswordDialog";
