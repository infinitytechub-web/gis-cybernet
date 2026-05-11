// src/lib/firewall.ts
// Client-side wrapper around the Postgres firewall RPCs + magic-byte sniffing.
// Always pair the local pre-check with the server-side RPC for defence-in-depth.

import { supabase } from "@/integrations/supabase/client";

export type FirewallAction = "allow" | "warn" | "quarantine" | "block";
export type FirewallLayer = "file" | "url" | "auth" | "waf";

export interface FirewallVerdict {
  action: FirewallAction;
  reason: string;
  matched_rule_id?: string | null;
  matched_threat_id?: string | null;
  /** Extra context the caller may want to log/show (e.g. detected MIME mismatch). */
  extra?: Record<string, unknown>;
}

const ALLOW: FirewallVerdict = { action: "allow", reason: "ok" };

/* ─────────────── Magic-byte sniffer (covers common dangerous formats) ─────────────── */

interface Magic {
  mime: string;
  ext: string;
  bytes: number[];
  mask?: number[];
  offset?: number;
}

const MAGIC_TABLE: Magic[] = [
  // Windows / Linux executables
  { mime: "application/x-msdownload", ext: "exe", bytes: [0x4d, 0x5a] }, // MZ
  { mime: "application/x-elf",        ext: "elf", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  // Scripts (just sniff shebangs)
  { mime: "text/x-shellscript",       ext: "sh",  bytes: [0x23, 0x21] }, // #!
  // Archives
  { mime: "application/zip",          ext: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/x-rar-compressed", ext: "rar", bytes: [0x52, 0x61, 0x72, 0x21] },
  { mime: "application/x-7z-compressed", ext: "7z", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { mime: "application/x-iso9660-image", ext: "iso", offset: 0x8001, bytes: [0x43, 0x44, 0x30, 0x30, 0x31] },
  { mime: "application/java-archive", ext: "jar", bytes: [0x50, 0x4b, 0x03, 0x04] },
  // Office / docs
  { mime: "application/pdf",          ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  // Images (safe)
  { mime: "image/png",                ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg",               ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif",                ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

async function sniffMagic(file: File): Promise<{ mime: string | null; ext: string | null }> {
  // Read enough bytes for the deepest signature (ISO at 0x8001+5).
  const sliceSize = Math.min(file.size, 0x8010);
  const buf = new Uint8Array(await file.slice(0, sliceSize).arrayBuffer());
  for (const m of MAGIC_TABLE) {
    const off = m.offset ?? 0;
    if (buf.length < off + m.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < m.bytes.length; i++) {
      if (buf[off + i] !== m.bytes[i]) { ok = false; break; }
    }
    if (ok) return { mime: m.mime, ext: m.ext };
  }
  return { mime: null, ext: null };
}

function fileExtension(name: string): string {
  const m = /\.([^.]+)$/.exec(name.toLowerCase());
  return m ? m[1] : "";
}

/* ─────────────── File scan (local sniff + server verdict) ─────────────── */

export async function scanFile(file: File): Promise<FirewallVerdict> {
  const declaredExt = fileExtension(file.name);
  const sniffed = await sniffMagic(file);

  // Local short-circuit: extension/MIME mismatch is always suspicious.
  const mismatch =
    sniffed.ext &&
    declaredExt &&
    sniffed.ext !== declaredExt &&
    // tolerate jpg/jpeg + zip/jar twins
    !(sniffed.ext === "jpg" && declaredExt === "jpeg") &&
    // OOXML (Office 2007+) and other modern container formats are ZIPs under the hood
    !(sniffed.ext === "zip" && ["jar", "docx", "xlsx", "pptx", "docm", "xlsm", "pptm", "odt", "ods", "odp", "epub", "apk"].includes(declaredExt));

  const { data, error } = await supabase.rpc("firewall_evaluate_file", {
    _filename: file.name,
    _mime: sniffed.mime ?? file.type ?? "application/octet-stream",
    _size_bytes: file.size,
  });
  if (error) {
    return { action: "block", reason: `Firewall error: ${error.message}` };
  }
  const verdict = (data ?? {}) as unknown as FirewallVerdict;
  const result: FirewallVerdict = {
    action: verdict.action ?? "allow",
    reason: verdict.reason ?? "ok",
    matched_rule_id: verdict.matched_rule_id,
    extra: { sniffed_mime: sniffed.mime, sniffed_ext: sniffed.ext, declared_ext: declaredExt },
  };

  if (mismatch) {
    // Escalate to at least quarantine.
    if (result.action === "allow" || result.action === "warn") {
      result.action = "quarantine";
      result.reason = `File extension .${declaredExt} does not match its actual content (.${sniffed.ext}).`;
    }
  }
  return result;
}

/* ─────────────── URL scan (server verdict) ─────────────── */

export async function scanUrl(url: string): Promise<FirewallVerdict> {
  if (!url) return ALLOW;
  const { data, error } = await supabase.rpc("firewall_evaluate_url", { _url: url });
  if (error) {
    return { action: "block", reason: `Firewall error: ${error.message}` };
  }
  return (data ?? ALLOW) as unknown as FirewallVerdict;
}

/* ─────────────── WAF: detect common attack patterns in user-supplied strings ─────────────── */

const WAF_PATTERNS: { name: string; pattern: RegExp; action: FirewallAction }[] = [
  { name: "SQL injection (UNION)", pattern: /\bunion\s+(all\s+)?select\b/i, action: "block" },
  { name: "SQL injection (boolean)", pattern: /(\b(or|and)\b\s+\d+=\d+)/i, action: "quarantine" },
  { name: "JS URI scheme", pattern: /javascript:/i, action: "quarantine" },
  { name: "Inline <script> tag", pattern: /<\s*script[^>]*>/i, action: "quarantine" },
  { name: "Path traversal", pattern: /\.\.\/{1,}/, action: "quarantine" },
  { name: "Event handler injection", pattern: /\son\w+\s*=\s*["']?[^"']/i, action: "quarantine" },
];

/**
 * Cheap, local-only WAF check for free-text inputs.
 * Returns the first matching rule's verdict, or `allow`.
 */
export function inspectInput(input: string | null | undefined): FirewallVerdict {
  if (!input) return ALLOW;
  for (const r of WAF_PATTERNS) {
    if (r.pattern.test(input)) {
      return { action: r.action, reason: r.name };
    }
  }
  return ALLOW;
}

/* ─────────────── Reporting helper ─────────────── */

export async function recordFirewallEvent(opts: {
  layer: FirewallLayer;
  action: FirewallAction;
  subject: string;
  details?: Record<string, unknown>;
  matched_rule_id?: string | null;
  matched_threat_id?: string | null;
}): Promise<void> {
  try {
    await supabase.rpc("firewall_record_event", {
      _layer: opts.layer,
      _action: opts.action,
      _subject: opts.subject.slice(0, 500),
      _details: (opts.details ?? {}) as any,
      _matched_rule_id: opts.matched_rule_id ?? null,
      _matched_threat_id: opts.matched_threat_id ?? null,
    });
  } catch {
    /* best effort — never block UX on logging */
  }
}
