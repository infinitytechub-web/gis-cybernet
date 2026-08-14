import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MailCheck, Send, Loader2, AlertTriangle, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; messageId?: string; recipient: string; at: string }
  | { kind: "error"; message: string };

interface DomainState {
  status: string;
  last_checked_at: string;
  became_active_at: string | null;
}

export function EmailDeliveryTest() {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [domain, setDomain] = useState<DomainState | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const loadDomain = async () => {
    const { data } = await supabase
      .from("email_domain_status" as any)
      .select("status, last_checked_at, became_active_at")
      .eq("domain", "notify.gis-cybernet.com")
      .maybeSingle();
    if (data) setDomain(data as any);
  };

  useEffect(() => {
    loadDomain();
    const ch = supabase
      .channel("email_domain_status")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_domain_status" }, loadDomain)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const recheckNow = async () => {
    setRechecking(true);
    const { data, error } = await supabase.functions.invoke("email-domain-recheck", { body: {} });
    setRechecking(false);
    if (error) { toast.error(error.message); return; }
    const cur = (data as any)?.current_status;
    if ((data as any)?.transitioned_to_active) {
      toast.success("Domain is now Active — email sending enabled.");
    } else {
      toast.info(`Domain status: ${cur ?? "unknown"}`);
    }
    loadDomain();
  };

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  const send = async () => {
    if (!isValidEmail) {
      toast.error("Enter a valid email address.");
      return;
    }
    setStatus({ kind: "sending" });
    const sentAt = new Date().toISOString();
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "test-email",
        recipientEmail: recipient.trim(),
        idempotencyKey: `admin-test-${user?.id ?? "anon"}-${Date.now()}`,
        templateData: {
          sentBy: user?.email ?? "Administrator",
          sentAt,
          note: note.trim() || undefined,
        },
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message || "Send failed." });
      toast.error(error.message || "Failed to send test email.");
      return;
    }
    const messageId = (data as any)?.messageId || (data as any)?.message_id;
    setStatus({ kind: "sent", messageId, recipient: recipient.trim(), at: sentAt });
    toast.success("Test email queued for delivery.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5 text-primary" /> Email Delivery Test
        </CardTitle>
        <CardDescription>
          Send a one-off test email from <span className="font-mono">notify.gis-cybernet.com</span> to verify
          the sending pipeline. The status of the request appears below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 bg-muted/30 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className={`h-4 w-4 ${domain?.status === "active" ? "text-emerald-600" : "text-amber-600"}`} />
            <span className="font-medium">Sender domain:</span>
            <span className="font-mono">notify.gis-cybernet.com</span>
            <Badge
              variant="outline"
              className={
                domain?.status === "active"
                  ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-700 border-amber-500/30"
              }
            >
              {domain?.status ?? "unknown"}
            </Badge>
            {domain?.last_checked_at && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDateTime(domain.last_checked_at)}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={recheckNow} disabled={rechecking}>
            {rechecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Recheck now
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          DNS is rechecked automatically every 15 minutes. Admins receive an in-app notification the moment{" "}
          <span className="font-mono">notify.gis-cybernet.com</span> becomes <strong>Active</strong>, and email sending
          enables automatically.
        </p>
        <div className="space-y-2">
          <Label htmlFor="test-recipient">Recipient email</Label>
          <Input
            id="test-recipient"
            type="email"
            placeholder="name@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={status.kind === "sending"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-note">Optional note</Label>
          <Textarea
            id="test-note"
            placeholder="Included in the email body for context."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            disabled={status.kind === "sending"}
          />
        </div>
        <Button onClick={send} disabled={!isValidEmail || status.kind === "sending"}>
          {status.kind === "sending" ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
          ) : (
            <><Send className="h-4 w-4 mr-2" /> Send Test Email</>
          )}
        </Button>

        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-1">Status</div>
          {status.kind === "idle" && (
            <div className="text-sm text-muted-foreground">No test sent yet.</div>
          )}
          {status.kind === "sending" && (
            <div className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Queueing email…</div>
          )}
          {status.kind === "sent" && (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/20">Queued</Badge>
                <span className="text-muted-foreground">→ {status.recipient}</span>
              </div>
              <div className="text-xs text-muted-foreground">Submitted at: {formatDateTime(status.at)}</div>
              {status.messageId && (
                <div className="text-xs font-mono text-muted-foreground break-all">message_id: {status.messageId}</div>
              )}
              <div className="text-xs text-muted-foreground">
                Delivery completes via the email queue within ~5–15 seconds. If DNS verification is still pending for{" "}
                <span className="font-mono">notify.gis-cybernet.com</span>, the message stays queued until the domain is active.
              </div>
            </div>
          )}
          {status.kind === "error" && (
            <div className="text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{status.message}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
