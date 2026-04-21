import { useState, useEffect, useRef } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, XCircle, Clock, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordPdfBase64, type RecordKind, RECORD_TITLES } from "@/lib/record-pdf";

interface EmailShareDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: RecordKind;
  record: Record<string, any>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BULK_MAX = 200;

interface RecipientResult {
  email: string;
  status: "sent" | "queued" | "failed";
  message_id?: string;
  error?: string;
}

function parseEmailList(
  input: string,
): { valid: string[]; invalid: string[]; duplicates: number } {
  const parts = input
    .split(/[,;\s\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (seen.has(lower)) {
      duplicates++;
      continue;
    }
    seen.add(lower);
    (EMAIL_RE.test(p) ? valid : invalid).push(p);
  }
  return { valid, invalid, duplicates };
}

function extractEmailsFromCsv(
  csv: string,
): { emails: string[]; duplicates: number } {
  // Split by commas, semicolons, tabs, or newlines; match anything that looks like an email.
  const tokens = csv.split(/[\n\r,;\t"]+/).map((t) => t.trim()).filter(Boolean);
  const emails: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const t of tokens) {
    const match = t.match(/[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/);
    if (match) {
      const e = match[0].replace(/[.,;]+$/, "");
      const lower = e.toLowerCase();
      if (!EMAIL_RE.test(e)) continue;
      if (seen.has(lower)) {
        duplicates++;
        continue;
      }
      seen.add(lower);
      emails.push(e);
    }
  }
  return { emails, duplicates };
}

/** Merge new emails into an existing textarea value, de-duplicating case-insensitively. */
function mergeUniqueEmails(
  existing: string,
  incoming: string[],
): { merged: string; added: number; skipped: number } {
  const current = parseEmailList(existing).valid;
  const seen = new Set(current.map((e) => e.toLowerCase()));
  let added = 0;
  let skipped = 0;
  const next = [...current];
  for (const e of incoming) {
    const lower = e.toLowerCase();
    if (seen.has(lower)) {
      skipped++;
      continue;
    }
    seen.add(lower);
    next.push(e);
    added++;
  }
  return { merged: next.join("\n"), added, skipped };
}

export function EmailShareDialog({ open, onOpenChange, kind, record }: EmailShareDialogProps) {
  const [step, setStep] = useState<"compose" | "preview">("compose");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<RecipientResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("compose");
      setMode("single");
      setTo("");
      setCc("");
      setBcc("");
      setBulkText("");
      setResults(null);
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

  const validEmail = EMAIL_RE.test(to.trim());
  const ccParsed = parseEmailList(cc);
  const bccParsed = parseEmailList(bcc);
  const ccInvalid = ccParsed.invalid.length > 0;
  const bccInvalid = bccParsed.invalid.length > 0;

  const bulkParsed = parseEmailList(bulkText);
  const bulkList = bulkParsed.valid.slice(0, BULK_MAX);
  const bulkOverflow = bulkParsed.valid.length > BULK_MAX;

  const canSend =
    !sending &&
    (mode === "single"
      ? validEmail && !ccInvalid && !bccInvalid
      : bulkList.length > 0);

  const safeName = String(record.applicant_name || record.id || "record")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const attachmentFilename = `${kind}_${safeName}.pdf`;

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("CSV must be under 2 MB");
      return;
    }
    try {
      const text = await file.text();
      const { emails, duplicates: csvDupes } = extractEmailsFromCsv(text);
      if (emails.length === 0) {
        toast.error("No valid email addresses found in file");
        return;
      }
      // Merge into existing textarea, deduping case-insensitively across both.
      const { merged, added, skipped } = mergeUniqueEmails(bulkText, emails);
      setBulkText(merged);
      const totalSkipped = skipped + csvDupes;
      if (added === 0) {
        toast.info(`No new recipients — all ${emails.length} already in the list`);
      } else if (totalSkipped > 0) {
        toast.success(
          `Added ${added} recipient${added === 1 ? "" : "s"} · skipped ${totalSkipped} duplicate${totalSkipped === 1 ? "" : "s"}`,
        );
      } else {
        toast.success(`Added ${added} recipient${added === 1 ? "" : "s"}`);
      }
    } catch {
      toast.error("Could not read the file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const validateCompose = (): boolean => {
    if (mode === "single") {
      if (!validEmail) { toast.error("Please enter a valid recipient email"); return false; }
      if (ccInvalid) { toast.error(`Invalid CC: ${ccParsed.invalid.join(", ")}`); return false; }
      if (bccInvalid) { toast.error(`Invalid BCC: ${bccParsed.invalid.join(", ")}`); return false; }
    } else if (bulkList.length === 0) {
      toast.error("Add at least one valid recipient");
      return false;
    }
    return true;
  };

  const handleReview = () => {
    if (validateCompose()) setStep("preview");
  };

  const handleSend = async () => {
    if (!validateCompose()) return;

    setSending(true);
    setResults(null);
    try {
      const attachment = recordPdfBase64(kind, record);

      const payload =
        mode === "single"
          ? {
              to: to.trim(),
              cc: ccParsed.valid,
              bcc: bccParsed.valid,
              subject,
              message,
              attachment_base64: attachment,
              attachment_filename: attachmentFilename,
              record_kind: kind,
              record_id: record.id,
            }
          : {
              bulk: true,
              recipients: bulkList,
              subject,
              message,
              attachment_base64: attachment,
              attachment_filename: attachmentFilename,
              record_kind: kind,
              record_id: record.id,
            };

      const { data, error } = await supabase.functions.invoke("send-record-email", {
        body: payload,
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const r: RecipientResult[] = (data as any)?.results ?? [];
      const summary = (data as any)?.summary ?? { total: r.length, sent: 0, queued: 0, failed: 0 };
      setResults(r);

      if (summary.failed === 0) {
        toast.success(
          summary.total === 1
            ? `Document sent to ${r[0]?.email ?? "recipient"}`
            : `Sent to ${summary.sent + summary.queued} of ${summary.total} recipients`
        );
      } else if (summary.sent + summary.queued > 0) {
        toast.warning(
          `Partial delivery — ${summary.sent + summary.queued} sent, ${summary.failed} failed`
        );
      } else {
        toast.error("All sends failed — see details below");
      }
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

  const statusBadge = (r: RecipientResult) => {
    if (r.status === "sent")
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Sent
        </Badge>
      );
    if (r.status === "queued")
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> Queued
        </Badge>
      );
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "preview" && !results ? "Review & Send" : "Send via Email"}
          </DialogTitle>
          <DialogDescription>
            {step === "preview" && !results
              ? "Confirm the details below before sending."
              : `A PDF of this ${RECORD_TITLES[kind].toLowerCase()} will be attached.`}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" && !results && (
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="bulk">Bulk send</TabsTrigger>
              </TabsList>

              <TabsContent value="single" className="space-y-3 pt-3">
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
                  <Label>CC</Label>
                  <Input
                    placeholder="cc1@example.com, cc2@example.com"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    aria-invalid={ccInvalid}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Separate multiple addresses with commas.
                  </p>
                </div>
                <div>
                  <Label>BCC</Label>
                  <Input
                    placeholder="bcc@example.com"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    aria-invalid={bccInvalid}
                  />
                </div>
              </TabsContent>

              <TabsContent value="bulk" className="space-y-3 pt-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Recipients (one per line or comma-separated)</Label>
                    <div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className="mr-2 h-3.5 w-3.5" /> Upload CSV
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={6}
                    placeholder="alice@example.com&#10;bob@example.com, carol@example.com"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    <Badge variant="secondary">{bulkList.length} unique</Badge>
                    {bulkParsed.duplicates > 0 && (
                      <Badge variant="outline" title="Duplicate addresses are automatically removed — each recipient is sent the email only once.">
                        {bulkParsed.duplicates} duplicate{bulkParsed.duplicates === 1 ? "" : "s"} removed
                      </Badge>
                    )}
                    {bulkParsed.invalid.length > 0 && (
                      <Badge variant="destructive">{bulkParsed.invalid.length} invalid</Badge>
                    )}
                    {bulkOverflow && (
                      <Badge variant="outline">Only first {BULK_MAX} will be sent</Badge>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-3">
              <div>
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === "preview" && !results && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border divide-y">
              <PreviewRow label="To">
                {mode === "single" ? (
                  <span className="break-all">{to.trim()}</span>
                ) : (
                  <div className="space-y-1">
                    <Badge variant="secondary">
                      {bulkList.length} recipient{bulkList.length === 1 ? "" : "s"}
                    </Badge>
                    <div className="text-xs text-muted-foreground break-all line-clamp-3">
                      {bulkList.slice(0, 8).join(", ")}
                      {bulkList.length > 8 ? `, +${bulkList.length - 8} more` : ""}
                    </div>
                  </div>
                )}
              </PreviewRow>
              {mode === "single" && (
                <>
                  <PreviewRow label="CC">
                    {ccParsed.valid.length > 0 ? (
                      <span className="break-all">{ccParsed.valid.join(", ")}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </PreviewRow>
                  <PreviewRow label="BCC">
                    {bccParsed.valid.length > 0 ? (
                      <span className="break-all">{bccParsed.valid.join(", ")}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </PreviewRow>
                </>
              )}
              <PreviewRow label="Subject">
                <span className="break-words">
                  {subject || <span className="text-muted-foreground">(no subject)</span>}
                </span>
              </PreviewRow>
              <PreviewRow label="Message">
                <div className="whitespace-pre-wrap text-xs text-muted-foreground max-h-32 overflow-y-auto">
                  {message || "(empty)"}
                </div>
              </PreviewRow>
              <PreviewRow label="Attachment">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs break-all">{attachmentFilename}</span>
                  <Badge variant="outline" className="text-[10px]">PDF</Badge>
                </div>
              </PreviewRow>
            </div>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
            <div className="px-3 py-2 bg-muted/50 text-xs font-medium">
              Delivery results ({results.length})
            </div>
            {results.map((r, i) => (
              <div key={`${r.email}-${i}`} className="px-3 py-2 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.email}</div>
                  {r.message_id && (
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      id: {r.message_id}
                    </div>
                  )}
                  {r.error && (
                    <div className="text-xs text-destructive truncate" title={r.error}>
                      {r.error}
                    </div>
                  )}
                </div>
                {statusBadge(r)}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && !results && (
            <Button
              variant="outline"
              onClick={() => setStep("compose")}
              disabled={sending}
              className="mr-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && step === "compose" && (
            <Button
              onClick={handleReview}
              disabled={
                sending ||
                (mode === "single"
                  ? !(validEmail && !ccInvalid && !bccInvalid)
                  : bulkList.length === 0)
              }
            >
              Review
            </Button>
          )}
          {!results && step === "preview" && (
            <Button onClick={handleSend} disabled={!canSend}>
              {sending
                ? "Sending..."
                : mode === "bulk"
                ? `Send to ${bulkList.length} recipient${bulkList.length === 1 ? "" : "s"}`
                : "Send Email"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground pt-0.5">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
