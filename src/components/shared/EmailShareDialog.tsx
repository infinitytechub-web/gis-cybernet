import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordPdfBase64, type RecordKind, RECORD_TITLES } from "@/lib/record-pdf";

interface EmailShareDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: RecordKind;
  record: Record<string, any>;
}

export function EmailShareDialog({ open, onOpenChange, kind, record }: EmailShareDialogProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo("");
      setSubject(
        `${RECORD_TITLES[kind]} — ${record.applicant_name ?? record.id ?? ""}`.trim()
      );
      setMessage(
        `Please find attached the ${RECORD_TITLES[kind].toLowerCase()} for ${
          record.applicant_name ?? "the applicant"
        }.\n\nSent via Ghana Immigration Service — Cybernet.`
      );
    }
  }, [open, kind, record]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const handleSend = async () => {
    if (!validEmail) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const attachment = recordPdfBase64(kind, record);
      const safeName = String(record.applicant_name || record.id || "record")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "");
      const filename = `${kind}_${safeName}.pdf`;

      const { data, error } = await supabase.functions.invoke("send-record-email", {
        body: {
          to: to.trim(),
          subject,
          message,
          attachment_base64: attachment,
          attachment_filename: filename,
          record_kind: kind,
          record_id: record.id,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Document sent to ${to}`);
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || "Failed to send email";
      if (/not configured|RESEND_API_KEY|connector/i.test(msg)) {
        toast.error("Email connector not configured. Ask an admin to connect Resend in Cloud → Connectors.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send via Email</DialogTitle>
          <DialogDescription>
            A PDF of this {RECORD_TITLES[kind].toLowerCase()} will be attached to the message.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Recipient email *</Label>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!validEmail || sending}>
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
