import { useState, useEffect, useRef, useMemo } from "react";
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
import { Upload, CheckCircle2, XCircle, Clock, FileText, ArrowLeft, Download, ShieldCheck, Copy, FlaskConical, Paperclip, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordPdfBase64, buildRecordPdf, type RecordKind, RECORD_TITLES } from "@/lib/record-pdf";

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

/**
 * Per-address occurrence breakdown for bulk textarea input.
 * Returns the first-seen form of each address with how many times it appeared
 * (so "1" means unique, ">1" means N-1 copies were dropped).
 */
export interface BulkBreakdownEntry {
  email: string;
  count: number;
}
function computeBulkBreakdown(input: string): {
  unique: BulkBreakdownEntry[];
  duplicates: BulkBreakdownEntry[];
  totalDuplicatesRemoved: number;
} {
  const parts = input
    .split(/[,;\s\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => EMAIL_RE.test(p));
  const map = new Map<string, BulkBreakdownEntry>();
  for (const p of parts) {
    const lower = p.toLowerCase();
    const existing = map.get(lower);
    if (existing) existing.count++;
    else map.set(lower, { email: p, count: 1 });
  }
  const unique = Array.from(map.values());
  const duplicates = unique.filter((e) => e.count > 1);
  const totalDuplicatesRemoved = duplicates.reduce((s, e) => s + (e.count - 1), 0);
  return { unique, duplicates, totalDuplicatesRemoved };
}

/**
 * Final, authoritative dedup pass run immediately before the network request.
 * Returns the cleaned address sets plus a report of what was removed and why.
 */
export interface FinalDedupeReport {
  removedFromCc: string[];
  removedFromBcc: string[];
  removedFromBulk: string[];
  totalRemoved: number;
}
function finalDedupeSingle(
  to: string,
  cc: string[],
  bcc: string[],
): { to: string; cc: string[]; bcc: string[]; report: FinalDedupeReport } {
  const seen = new Set<string>();
  const toLower = to.trim().toLowerCase();
  seen.add(toLower);
  const cleanCc: string[] = [];
  const removedFromCc: string[] = [];
  for (const e of cc) {
    const l = e.toLowerCase();
    if (seen.has(l)) removedFromCc.push(e);
    else { seen.add(l); cleanCc.push(e); }
  }
  const cleanBcc: string[] = [];
  const removedFromBcc: string[] = [];
  for (const e of bcc) {
    const l = e.toLowerCase();
    if (seen.has(l)) removedFromBcc.push(e);
    else { seen.add(l); cleanBcc.push(e); }
  }
  return {
    to: to.trim(),
    cc: cleanCc,
    bcc: cleanBcc,
    report: {
      removedFromCc,
      removedFromBcc,
      removedFromBulk: [],
      totalRemoved: removedFromCc.length + removedFromBcc.length,
    },
  };
}
function finalDedupeBulk(recipients: string[]): { recipients: string[]; report: FinalDedupeReport } {
  const seen = new Set<string>();
  const clean: string[] = [];
  const removed: string[] = [];
  for (const e of recipients) {
    const l = e.toLowerCase();
    if (seen.has(l)) removed.push(e);
    else { seen.add(l); clean.push(e); }
  }
  return {
    recipients: clean,
    report: {
      removedFromCc: [],
      removedFromBcc: [],
      removedFromBulk: removed,
      totalRemoved: removed.length,
    },
  };
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
  const [attachmentConfirmed, setAttachmentConfirmed] = useState(false);
  const [extraAttachments, setExtraAttachments] = useState<Array<{ filename: string; size: number; content_base64: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const MAX_EXTRA_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
  const MAX_EXTRA_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB across all extras
  const MAX_EXTRA_COUNT = 5;

  useEffect(() => {
    if (open) {
      setStep("compose");
      setMode("single");
      setTo("");
      setCc("");
      setBcc("");
      setBulkText("");
      setResults(null);
      setAttachmentConfirmed(false);
      setExtraAttachments([]);
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

  // Reset attachment confirmation whenever user leaves the preview step.
  useEffect(() => {
    if (step !== "preview") setAttachmentConfirmed(false);
  }, [step]);

  const validEmail = EMAIL_RE.test(to.trim());
  const ccParsed = parseEmailList(cc);
  const bccParsed = parseEmailList(bcc);
  const ccInvalid = ccParsed.invalid.length > 0;
  const bccInvalid = bccParsed.invalid.length > 0;

  const bulkParsed = parseEmailList(bulkText);
  const bulkList = bulkParsed.valid.slice(0, BULK_MAX);
  const bulkOverflow = bulkParsed.valid.length > BULK_MAX;
  const bulkBreakdown = computeBulkBreakdown(bulkText);

  // Preview-time dedup report for single mode (what *would* be removed at send).
  const singlePreviewReport =
    mode === "single"
      ? finalDedupeSingle(to, ccParsed.valid, bccParsed.valid).report
      : null;

  const canSend =
    !sending &&
    attachmentConfirmed &&
    (mode === "single"
      ? validEmail && !ccInvalid && !bccInvalid
      : bulkList.length > 0);

  const safeName = String(record.applicant_name || record.id || "record")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const attachmentFilename = `${kind}_${safeName}.pdf`;

  // Build the PDF once per preview entry so we can show the real byte size
  // and offer preview/download of the exact file that will be attached.
  const attachmentMeta = useMemo(() => {
    if (step !== "preview" || results) return null;
    try {
      const doc = buildRecordPdf(kind, record);
      const blob = doc.output("blob") as Blob;
      return {
        blob,
        size: blob.size,
        url: URL.createObjectURL(blob),
        generatedAt: new Date(),
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, results, kind, record]);

  // Compute SHA-256 of the generated PDF for tamper-evidence / integrity check.
  // Full 64-char hex is stored in audit; UI shows short prefix with copy button.
  const [attachmentHash, setAttachmentHash] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!attachmentMeta?.blob) {
      setAttachmentHash(null);
      return;
    }
    (async () => {
      try {
        const buf = await attachmentMeta.blob.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (!cancelled) setAttachmentHash(hex);
      } catch {
        if (!cancelled) setAttachmentHash(null);
      }
    })();
    return () => { cancelled = true; };
  }, [attachmentMeta?.blob]);

  // Release the object URL when the component unmounts or meta changes.
  useEffect(() => {
    return () => {
      if (attachmentMeta?.url) URL.revokeObjectURL(attachmentMeta.url);
    };
  }, [attachmentMeta?.url]);

  /** Build the final deduped recipient list as a downloadable CSV. */
  const handleDownloadRecipientsCsv = () => {
    const rows: Array<{ role: string; email: string }> = [];
    if (mode === "single") {
      const clean = finalDedupeSingle(to, ccParsed.valid, bccParsed.valid);
      if (clean.to) rows.push({ role: "TO", email: clean.to });
      clean.cc.forEach((e) => rows.push({ role: "CC", email: e }));
      clean.bcc.forEach((e) => rows.push({ role: "BCC", email: e }));
    } else {
      const clean = finalDedupeBulk(bulkList);
      clean.recipients.forEach((e) => rows.push({ role: "TO", email: e }));
    }
    if (rows.length === 0) {
      toast.error("No recipients to export");
      return;
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "role,email\n" + rows.map((r) => `${escape(r.role)},${escape(r.email)}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}_${safeName}_recipients.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} recipient${rows.length === 1 ? "" : "s"} to CSV`);
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

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

  const totalExtraBytes = extraAttachments.reduce((s, a) => s + a.size, 0);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const result = r.result as string;
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      r.onerror = () => reject(new Error("Could not read file"));
      r.readAsDataURL(file);
    });

  const handleExtraFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    if (extraAttachments.length + incoming.length > MAX_EXTRA_COUNT) {
      toast.error(`Up to ${MAX_EXTRA_COUNT} extra attachments allowed`);
      return;
    }
    let runningTotal = totalExtraBytes;
    const next = [...extraAttachments];
    let added = 0;
    for (const f of incoming) {
      if (f.size > MAX_EXTRA_FILE_BYTES) {
        toast.error(`"${f.name}" is over 5 MB and was skipped`);
        continue;
      }
      if (runningTotal + f.size > MAX_EXTRA_TOTAL_BYTES) {
        toast.error("Total extra attachments would exceed 15 MB — some files were skipped");
        break;
      }
      try {
        const b64 = await fileToBase64(f);
        next.push({ filename: f.name, size: f.size, content_base64: b64 });
        runningTotal += f.size;
        added++;
      } catch {
        toast.error(`Could not read "${f.name}"`);
      }
    }
    setExtraAttachments(next);
    if (extraFileRef.current) extraFileRef.current.value = "";
    if (added > 0) toast.success(`Added ${added} attachment${added === 1 ? "" : "s"}`);
  };

  const removeExtra = (idx: number) =>
    setExtraAttachments((prev) => prev.filter((_, i) => i !== idx));

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

  /**
   * Dry-run: generate the PDF, compute its SHA-256, and write a mock entry
   * to front_desk_audit_log so the compliance workflow can be verified
   * end-to-end without emailing real recipients.
   *
   * Two modes:
   *   - "client": writes the audit row directly from the browser.
   *   - "server": invokes the send-record-email edge function with
   *     dry_run=true so the audit row is written from the exact same
   *     server path as a real send (same auth, same payload shape).
   */
  const [testing, setTesting] = useState<false | "client" | "server">(false);
  const handleTestSend = async (via: "client" | "server" = "client") => {
    if (!validateCompose()) return;
    setTesting(via);
    try {
      // Build the exact PDF and hash its bytes
      const attachment = recordPdfBase64(kind, record);
      let sha: string | null = null;
      try {
        const bin = atob(attachment);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        sha = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch { /* best-effort */ }

      // Resolve final recipient set (same dedup path as a real send)
      let recipientsList: string[] = [];
      let ccList: string[] = [];
      let bccList: string[] = [];
      if (mode === "single") {
        const clean = finalDedupeSingle(to, ccParsed.valid, bccParsed.valid);
        recipientsList = clean.to ? [clean.to] : [];
        ccList = clean.cc;
        bccList = clean.bcc;
      } else {
        recipientsList = finalDedupeBulk(bulkList).recipients;
      }

      const nowIso = new Date().toISOString();

      if (via === "server") {
        // Route through the exact same edge function as a real send, with
        // dry_run=true. The function validates, dedups, and writes the audit
        // row server-side — matching the production write path byte-for-byte.
        const payload =
          mode === "single"
            ? {
                to: recipientsList[0] ?? "",
                cc: ccList,
                bcc: bccList,
                subject,
                message,
                attachment_base64: attachment,
                attachment_filename: attachmentFilename,
                record_kind: kind,
                record_id: record.id,
                attachment_sha256: sha,
                attachment_generated_at: nowIso,
                applicant_id: record.id ?? null,
                applicant_name: record.applicant_name ?? null,
                extra_attachments: extraAttachments,
                dry_run: true,
              }
            : {
                bulk: true,
                recipients: recipientsList,
                subject,
                message,
                attachment_base64: attachment,
                attachment_filename: attachmentFilename,
                record_kind: kind,
                record_id: record.id,
                attachment_sha256: sha,
                attachment_generated_at: nowIso,
                applicant_id: record.id ?? null,
                applicant_name: record.applicant_name ?? null,
                extra_attachments: extraAttachments,
                dry_run: true,
              };

        const { data, error } = await supabase.functions.invoke("send-record-email", {
          body: payload,
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);

        const r: RecipientResult[] = ((data as any)?.results ?? []).map((x: any) => ({
          email: x.email,
          status: "sent" as const,
          message_id: x.message_id ?? `test_${crypto.randomUUID()}`,
        }));
        setResults(r);
        toast.success(
          `Server test logged · SHA-256 ${sha ? sha.slice(0, 10) + "…" : "n/a"} · ${r.length} recipient${
            r.length === 1 ? "" : "s"
          } simulated`,
        );
        return;
      }

      // Client-side path: write the mock audit row directly.
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        toast.error("You must be signed in to run a test send");
        setTesting(false);
        return;
      }

      const mockResults: RecipientResult[] = recipientsList.map((e) => ({
        email: e,
        status: "sent" as const,
        message_id: `test_${crypto.randomUUID()}`,
      }));

      const { error: logError } = await supabase
        .from("front_desk_audit_log")
        .insert({
          action: "email_share_test",
          entity_type: kind,
          entity_id: record.id ?? "",
          performed_by: uid,
          details: {
            test_mode: true,
            source: "client",
            mode: mode === "single" ? "single" : "bulk",
            recipient_count: recipientsList.length,
            sent: 0,
            queued: 0,
            failed: 0,
            cc: ccList,
            bcc: bccList,
            subject,
            attachment_filename: attachmentFilename,
            attachment_sha256: sha,
            attachment_generated_at: nowIso,
            record_kind: kind,
            applicant_id: record.id ?? null,
            applicant_name: record.applicant_name ?? null,
            sent_at: nowIso,
            note: "Simulated client-side send — no email dispatched",
            results: mockResults.map((r) => ({
              email: r.email,
              status: "simulated",
              message_id: r.message_id,
              error: null,
            })),
          },
        });

      if (logError) throw logError;

      setResults(mockResults);
      toast.success(
        `Test send logged · SHA-256 ${sha ? sha.slice(0, 10) + "…" : "n/a"} · ${recipientsList.length} recipient${
          recipientsList.length === 1 ? "" : "s"
        } simulated`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Test send failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSend = async () => {
    if (!validateCompose()) return;

    setSending(true);
    setResults(null);
    try {
      const attachment = recordPdfBase64(kind, record);

      // Recompute SHA-256 over the exact bytes being sent so the audit hash
      // matches the attachment payload, not just what was previewed.
      let sendHash: string | null = null;
      try {
        const bin = atob(attachment);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        sendHash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch { /* best-effort */ }

      const generatedAtIso = new Date().toISOString();

      // -------- Final authoritative dedup pass (runs every time, right before send).
      // This is intentionally redundant with earlier filtering — it guarantees the
      // outgoing payload never contains overlapping TO/CC/BCC or repeat bulk recipients
      // even if state somehow drifted between preview and send.
      let singleClean: ReturnType<typeof finalDedupeSingle> | null = null;
      let bulkClean: ReturnType<typeof finalDedupeBulk> | null = null;
      if (mode === "single") {
        singleClean = finalDedupeSingle(to, ccParsed.valid, bccParsed.valid);
        const { report } = singleClean;
        if (report.totalRemoved > 0) {
          const bits: string[] = [];
          if (report.removedFromCc.length)
            bits.push(`CC: ${report.removedFromCc.join(", ")}`);
          if (report.removedFromBcc.length)
            bits.push(`BCC: ${report.removedFromBcc.join(", ")}`);
          toast.info(
            `Removed ${report.totalRemoved} duplicate${report.totalRemoved === 1 ? "" : "s"} — ${bits.join(" · ")}`,
          );
        }
      } else {
        bulkClean = finalDedupeBulk(bulkList);
        if (bulkClean.report.removedFromBulk.length > 0) {
          toast.info(
            `Removed ${bulkClean.report.removedFromBulk.length} duplicate recipient${
              bulkClean.report.removedFromBulk.length === 1 ? "" : "s"
            } before sending`,
          );
        }
        if (bulkClean.recipients.length === 0) {
          toast.error("No unique recipients left after dedup");
          setSending(false);
          return;
        }
      }

      // Compliance metadata — recorded in the audit log for every send.
      const attachmentMetaPayload = {
        attachment_sha256: sendHash,
        attachment_generated_at: generatedAtIso,
        applicant_id: record.id ?? null,
        applicant_name: record.applicant_name ?? null,
      };

      const payload =
        mode === "single" && singleClean
          ? {
              to: singleClean.to,
              cc: singleClean.cc,
              bcc: singleClean.bcc,
              subject,
              message,
              attachment_base64: attachment,
              attachment_filename: attachmentFilename,
              record_kind: kind,
              record_id: record.id,
              ...attachmentMetaPayload,
            }
          : {
              bulk: true,
              recipients: bulkClean!.recipients,
              subject,
              message,
              attachment_base64: attachment,
              attachment_filename: attachmentFilename,
              record_kind: kind,
              record_id: record.id,
              ...attachmentMetaPayload,
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

              {/* Extra attachments picker — appended alongside the auto-generated record PDF */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Additional attachments
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {extraAttachments.length}/{MAX_EXTRA_COUNT} files · {formatBytes(totalExtraBytes)} / {formatBytes(MAX_EXTRA_TOTAL_BYTES)}
                  </span>
                </div>
                <input
                  ref={extraFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleExtraFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => extraFileRef.current?.click()}
                  disabled={extraAttachments.length >= MAX_EXTRA_COUNT}
                >
                  <Paperclip className="mr-2 h-3.5 w-3.5" /> Attach files
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Max {MAX_EXTRA_COUNT} files, 5 MB each, 15 MB total. Sent in addition to the record PDF.
                </p>
                {extraAttachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {extraAttachments.map((a, i) => (
                      <Badge
                        key={`${a.filename}-${i}`}
                        variant="secondary"
                        className="gap-1.5 pr-1 max-w-[260px]"
                      >
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate font-mono text-[11px]" title={a.filename}>
                          {a.filename}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatBytes(a.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeExtra(i)}
                          className="ml-0.5 rounded-sm p-0.5 hover:bg-background"
                          aria-label={`Remove ${a.filename}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
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
            </div>

            {/* Recipient list CSV export */}
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">Final recipient list</div>
                <div className="text-[11px] text-muted-foreground">
                  Export the exact TO/CC/BCC (or bulk) addresses after dedup.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadRecipientsCsv}
              >
                <Download className="mr-2 h-3.5 w-3.5" /> CSV
              </Button>
            </div>

            {/* Attachment review — explicit confirmation required before send */}
            <div className="rounded-md border-2 border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold">Attachment — final review</div>
              </div>
              <div className="px-3 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs break-all">{attachmentFilename}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">PDF</Badge>
                      {attachmentMeta && <span>{formatBytes(attachmentMeta.size)}</span>}
                    </div>

                    {/* Verification summary — confirm document identity at a glance */}
                    <div className="mt-2 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 text-[11px] rounded border bg-background/60 px-2 py-1.5">
                      <span className="text-muted-foreground">Kind</span>
                      <span className="font-medium">{RECORD_TITLES[kind]}</span>

                      <span className="text-muted-foreground">Applicant</span>
                      <span className="font-medium truncate" title={record.applicant_name ?? undefined}>
                        {record.applicant_name || <span className="text-muted-foreground">—</span>}
                      </span>

                      <span className="text-muted-foreground">Record ID</span>
                      <span className="font-mono truncate" title={record.id ?? undefined}>
                        {record.id ? String(record.id).slice(0, 8) + "…" : <span className="text-muted-foreground">—</span>}
                      </span>

                      <span className="text-muted-foreground">Generated</span>
                      <span>
                        {attachmentMeta
                          ? attachmentMeta.generatedAt.toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>

                      <span className="text-muted-foreground">SHA-256</span>
                      <span className="flex items-center gap-1 min-w-0">
                        {attachmentHash ? (
                          <>
                            <span
                              className="font-mono truncate"
                              title={attachmentHash}
                            >
                              {attachmentHash.slice(0, 16)}…
                            </span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground shrink-0"
                              title="Copy full hash"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(attachmentHash);
                                  toast.success("SHA-256 copied");
                                } catch {
                                  toast.error("Could not copy hash");
                                }
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground">computing…</span>
                        )}
                      </span>
                    </div>
                  </div>
                  {attachmentMeta && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => window.open(attachmentMeta.url, "_blank")}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={attachmentMeta.url} download={attachmentFilename}>
                          <Download className="mr-1 h-3 w-3" /> Save
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <Checkbox
                    checked={attachmentConfirmed}
                    onCheckedChange={(v) => setAttachmentConfirmed(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-xs">
                    I confirm the attachment above matches the document I want to send.
                  </span>
                </label>
              </div>
            </div>

            {/* Additional attachment preview chips */}
            {extraAttachments.length > 0 && (
              <div className="rounded-md border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Additional attachments
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {extraAttachments.length} file{extraAttachments.length === 1 ? "" : "s"} · {formatBytes(totalExtraBytes)}
                  </Badge>
                </div>
                <div className="px-3 py-2 flex flex-wrap gap-1.5">
                  {extraAttachments.map((a, i) => (
                    <Badge
                      key={`prev-${a.filename}-${i}`}
                      variant="secondary"
                      className="gap-1.5 max-w-[260px]"
                    >
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate font-mono text-[11px]" title={a.filename}>
                        {a.filename}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatBytes(a.size)}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Per-address duplicate breakdown (bulk mode) */}
            {mode === "bulk" && bulkBreakdown.duplicates.length > 0 && (
              <div className="rounded-md border border-dashed">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                  <div className="text-xs font-medium">Duplicates removed</div>
                  <Badge variant="outline" className="text-[10px]">
                    {bulkBreakdown.totalDuplicatesRemoved} copy
                    {bulkBreakdown.totalDuplicatesRemoved === 1 ? "" : "ies"} dropped ·{" "}
                    {bulkBreakdown.duplicates.length} address
                    {bulkBreakdown.duplicates.length === 1 ? "" : "es"}
                  </Badge>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y">
                  {bulkBreakdown.duplicates.map((d) => (
                    <div
                      key={d.email.toLowerCase()}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                    >
                      <span className="font-mono truncate">{d.email}</span>
                      <span className="text-muted-foreground shrink-0">
                        appeared {d.count}× · {d.count - 1} removed
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                  Each address will receive the email only once.
                </div>
              </div>
            )}

            {/* Single-mode cross-field duplicate warning */}
            {mode === "single" &&
              singlePreviewReport &&
              singlePreviewReport.totalRemoved > 0 && (
                <div className="rounded-md border border-dashed">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-medium">
                    Duplicates removed across TO / CC / BCC
                  </div>
                  <div className="px-3 py-2 space-y-1 text-xs">
                    {singlePreviewReport.removedFromCc.map((e) => (
                      <div key={`cc-${e}`} className="flex justify-between gap-3">
                        <span className="font-mono truncate">{e}</span>
                        <span className="text-muted-foreground shrink-0">
                          CC · already in TO/earlier field
                        </span>
                      </div>
                    ))}
                    {singlePreviewReport.removedFromBcc.map((e) => (
                      <div key={`bcc-${e}`} className="flex justify-between gap-3">
                        <span className="font-mono truncate">{e}</span>
                        <span className="text-muted-foreground shrink-0">
                          BCC · already in TO/CC
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
            <div className="px-3 py-2 bg-muted/50 text-xs font-medium flex items-center gap-2">
              <span>Delivery results ({results.length})</span>
              {results[0]?.message_id?.startsWith("test_") && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <FlaskConical className="h-3 w-3" /> Simulated
                </Badge>
              )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending || !!testing}>
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
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    disabled={sending || !!testing}
                    title="Simulate the send and write a mock audit log entry — no email dispatched"
                  >
                    <FlaskConical className="mr-2 h-4 w-4" />
                    {testing === "client"
                      ? "Logging (client)…"
                      : testing === "server"
                      ? "Logging (server)…"
                      : "Test send"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => handleTestSend("client")}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Client-side simulation</span>
                      <span className="text-[11px] text-muted-foreground">
                        Browser writes the mock audit row directly.
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTestSend("server")}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Server-side simulation</span>
                      <span className="text-[11px] text-muted-foreground">
                        Edge Function writes the audit row — matches the real send path.
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={handleSend} disabled={!canSend || !!testing}>
                {sending
                  ? "Sending..."
                  : mode === "bulk"
                  ? `Send to ${bulkList.length} recipient${bulkList.length === 1 ? "" : "s"}`
                  : "Send Email"}
              </Button>
            </>
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
