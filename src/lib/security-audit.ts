// src/lib/security-audit.ts
// Helpers for the hash-chained security audit log.
import { supabase } from "@/integrations/supabase/client";

export type SecurityCategory = "firewall" | "account" | "export" | "mfa" | "quarantine" | "dlp";
export type SecuritySeverity = "info" | "warn" | "high" | "critical";

export async function logSecurityEvent(opts: {
  category: SecurityCategory;
  action: string;
  severity?: SecuritySeverity;
  subject?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.rpc("log_security_event", {
      _category: opts.category,
      _action: opts.action,
      _severity: opts.severity ?? "info",
      _subject: opts.subject ?? null,
      _details: (opts.details ?? {}) as any,
      _ip: null,
      _ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
    });
  } catch {
    /* best-effort */
  }
}

export async function exportSecurityAudit(from: Date, to: Date) {
  const { data, error } = await supabase.rpc("export_security_audit", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw error;
  return data ?? [];
}

export async function verifySecurityAuditChain() {
  const { data, error } = await supabase.rpc("verify_security_audit_chain");
  if (error) throw error;
  return data ?? [];
}

export async function createSecurityAuditAnchor() {
  const { data, error } = await supabase.rpc("security_audit_create_anchor");
  if (error) throw error;
  return data;
}
