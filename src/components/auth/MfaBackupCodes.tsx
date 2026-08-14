// src/components/auth/MfaBackupCodes.tsx
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { KeyRound, Copy, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download-utils";
import { logSecurityEvent } from "@/lib/security-audit";
import { formatDateTime } from "@/lib/date-format";

const AUTO_HIDE_SECONDS = 60;

export default function MfaBackupCodes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCodes, setShowCodes] = useState<string[] | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_HIDE_SECONDS);
  const timerRef = useRef<number | null>(null);

  // Wipe codes from memory the instant the dialog is dismissed (any reason).
  const dismissCodes = () => {
    setShowCodes(null);
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Countdown + auto-hide while dialog is open.
  useEffect(() => {
    if (!showCodes) return;
    setSecondsLeft(AUTO_HIDE_SECONDS);
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // time's up — wipe and close
          window.clearInterval(timerRef.current!);
          timerRef.current = null;
          setShowCodes(null);
          toast.message("Backup codes hidden for security");
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    // Also wipe if the tab is hidden (user switches away)
    const onVis = () => { if (document.hidden) dismissCodes(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [showCodes]);

  const { data: remaining = 0 } = useQuery({
    queryKey: ["mfa-backup-remaining", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("mfa_backup_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .is("used_at", null);
      return count ?? 0;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("mfa_generate_backup_codes");
      if (error) throw error;
      return ((data as any[]) ?? []).map(r => r.code);
    },
    onSuccess: (codes) => {
      setShowCodes(codes);
      setConfirmRegen(false);
      qc.invalidateQueries({ queryKey: ["mfa-backup-remaining"] });
      logSecurityEvent({ category: "mfa", action: "backup_codes_visible", severity: "warn" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyAll = () => {
    if (!showCodes) return;
    navigator.clipboard.writeText(showCodes.join("\n"));
    toast.success("Copied to clipboard");
  };
  const downloadCodes = () => {
    if (!showCodes) return;
    const txt = `GIS Cybernet — MFA Backup Codes\nGenerated: ${formatDateTime(new Date())}\nUser: ${user?.email}\n\nKeep these codes safe. Each can be used ONCE.\n\n${showCodes.join("\n")}\n`;
    downloadBlob(new Blob([txt], { type: "text/plain" }), `gis-cybernet-backup-codes.txt`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-5 w-5 text-amber-600" /> Backup Recovery Codes
        </CardTitle>
        <CardDescription>
          One-time codes you can use if you lose access to your authenticator app or email.
          Keep them in a safe place — they bypass MFA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
          <div>
            <div className="font-medium text-sm">Remaining unused codes</div>
            <div className="text-2xl font-bold text-primary">{remaining}<span className="text-sm text-muted-foreground"> / 10</span></div>
          </div>
          <Button onClick={() => (remaining > 0 ? setConfirmRegen(true) : generate.mutate())}
            disabled={generate.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {remaining > 0 ? "Regenerate" : "Generate codes"}
          </Button>
        </div>
        {remaining > 0 && remaining <= 3 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>You only have {remaining} backup code(s) left. Generate a new set soon.</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <Dialog open={!!showCodes} onOpenChange={(o) => !o && dismissCodes()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Your new backup codes</span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  secondsLeft <= 10 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                }`}
                aria-live="polite"
              >
                Auto-hides in {secondsLeft}s
              </span>
            </DialogTitle>
            <DialogDescription>
              <strong>This is the only time these codes will be shown.</strong> Copy or download them now —
              they will disappear automatically when this dialog closes or in {AUTO_HIDE_SECONDS} seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted/40 p-4 rounded-lg">
            {(showCodes ?? []).map((c, i) => (
              <div key={c} className="select-all">
                <span className="text-muted-foreground mr-2">{String(i + 1).padStart(2, "0")}.</span>{c}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyAll}><Copy className="h-4 w-4 mr-2" /> Copy all</Button>
            <Button variant="outline" onClick={downloadCodes}><Download className="h-4 w-4 mr-2" /> Download .txt</Button>
            <Button onClick={dismissCodes}>I've saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace existing backup codes?</DialogTitle>
            <DialogDescription>
              All current codes will be invalidated immediately. You'll see the new ones once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRegen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Yes, replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
