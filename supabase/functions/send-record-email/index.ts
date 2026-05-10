// Send Record Email — delivers a record PDF as an attachment using the Resend connector.
// Supports single and bulk send modes. Returns per-recipient outcome + provider message ids.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

interface SendBody {
  // single-send (legacy; kept for backwards compat)
  to?: string;
  cc?: string[];
  bcc?: string[];
  // bulk mode
  recipients?: string[];
  bulk?: boolean;

  subject: string;
  message: string;
  attachment_base64: string;
  attachment_filename: string;
  record_kind: string;
  record_id?: string;

  // Compliance metadata (optional — older clients may omit)
  attachment_sha256?: string | null;
  attachment_generated_at?: string | null;
  applicant_id?: string | null;
  applicant_name?: string | null;

  // Optional extra user-picked attachments (in addition to the record PDF)
  extra_attachments?: Array<{ filename: string; content_base64: string; size?: number }>;

  // Server-side dry run: validate + dedup + write audit log, but skip delivery.
  dry_run?: boolean;
}

const MAX_EXTRA_FILE_BYTES = 5 * 1024 * 1024;
const MAX_EXTRA_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_EXTRA_COUNT = 5;

function sanitizeExtraAttachments(
  v: unknown,
): Array<{ filename: string; content_base64: string; size: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ filename: string; content_base64: string; size: number }> = [];
  let total = 0;
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const filename = String((item as any).filename ?? "").trim().slice(0, 200);
    const content_base64 = String((item as any).content_base64 ?? "");
    if (!filename || content_base64.length < 4) continue;
    // approx decoded byte size from base64 length
    const approxSize = Math.floor((content_base64.length * 3) / 4);
    if (approxSize > MAX_EXTRA_FILE_BYTES) continue;
    if (total + approxSize > MAX_EXTRA_TOTAL_BYTES) break;
    total += approxSize;
    out.push({ filename, content_base64, size: approxSize });
    if (out.length >= MAX_EXTRA_COUNT) break;
  }
  return out;
}

interface RecipientResult {
  email: string;
  status: "sent" | "queued" | "failed";
  message_id?: string;
  error?: string;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function sanitizeEmailList(v: unknown, max = 50): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isValidEmail(s))
    .slice(0, max);
}

const BULK_MAX = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    // Role check — restrict outbound emailing to staff that legitimately handle records.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowedRoles = new Set([
      "admin", "oic", "2ic", "staff_officer", "supervisor",
      "front_desk", "processing", "enforcement",
    ]);
    const hasRole = (roleRows ?? []).some((r: any) => allowedRoles.has(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse + validate input
    const body = (await req.json()) as SendBody;
    const errors: string[] = [];

    // Build recipient list (bulk or single)
    let recipients = sanitizeEmailList(body.recipients, BULK_MAX);
    const isBulk = body.bulk === true || recipients.length > 0;

    if (!isBulk) {
      if (!body.to || !isValidEmail(body.to)) errors.push("to");
      else recipients = [body.to.trim()];
    } else if (recipients.length === 0) {
      errors.push("recipients");
    }

    if (!body.subject || body.subject.length > 255) errors.push("subject");
    if (!body.message || body.message.length > 10_000) errors.push("message");
    if (!body.attachment_base64 || body.attachment_base64.length < 50) errors.push("attachment_base64");
    if (!body.attachment_filename) errors.push("attachment_filename");
    if (!body.record_kind) errors.push("record_kind");
    if (errors.length) {
      return new Response(
        JSON.stringify({ error: "Invalid input", fields: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isDryRun = body.dry_run === true;

    // Connector credentials — only required for real sends.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!isDryRun && (!LOVABLE_API_KEY || !RESEND_API_KEY)) {
      return new Response(
        JSON.stringify({
          error:
            "Email connector is not configured. Please connect Resend in Cloud → Connectors.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // CC/BCC only apply in single-send
    const ccList = isBulk ? [] : sanitizeEmailList(body.cc);
    const bccList = isBulk ? [] : sanitizeEmailList(body.bcc);

    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#39;");

    const htmlBody = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>${escapeHtml(body.message).replace(/\n/g, "<br/>")}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="font-size:12px;color:#64748b">
          Ghana Immigration Service — Amasaman Sector Command · Cybernet
        </p>
      </div>`;

    const extraAttachments = sanitizeExtraAttachments(body.extra_attachments);

    async function sendOne(recipient: string): Promise<RecipientResult> {
      const payload: Record<string, unknown> = {
        from: "Ghana Immigration Service <onboarding@resend.dev>",
        to: [recipient],
        subject: body.subject,
        text: body.message,
        html: htmlBody,
        attachments: [
          {
            filename: body.attachment_filename,
            content: body.attachment_base64,
          },
          ...extraAttachments.map((a) => ({
            filename: a.filename,
            content: a.content_base64,
          })),
        ],
      };
      if (ccList.length) payload.cc = ccList;
      if (bccList.length) payload.bcc = bccList;

      try {
        const resp = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify(payload),
        });

        const txt = await resp.text();
        let parsed: any = null;
        try { parsed = JSON.parse(txt); } catch { /* ignore */ }

        if (!resp.ok) {
          const errMsg = parsed?.error?.message || parsed?.message || txt.slice(0, 300);
          return { email: recipient, status: "failed", error: `[${resp.status}] ${errMsg}` };
        }

        // Resend returns { id: "..." } on success
        const messageId = parsed?.id || parsed?.data?.id;
        return {
          email: recipient,
          status: messageId ? "sent" : "queued",
          message_id: messageId,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "network error";
        return { email: recipient, status: "failed", error: msg };
      }
    }

    // Throttled sequential send (avoid hammering gateway). In dry-run mode we
    // skip the connector entirely and synthesise "simulated" outcomes so the
    // audit log is written from the exact same server path as a real send.
    const results: RecipientResult[] = [];
    if (isDryRun) {
      for (const r of recipients) {
        results.push({
          email: r,
          status: "sent",
          message_id: `test_${crypto.randomUUID()}`,
        });
      }
    } else {
      for (const r of recipients) {
        const res = await sendOne(r);
        results.push(res);
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const queued = results.filter((r) => r.status === "queued").length;
    const failed = results.filter((r) => r.status === "failed").length;

    // Audit trail — best effort, per-recipient summary + message ids + compliance metadata.
    // Dry runs use a distinct action so they can be filtered out of compliance reports.
    try {
      await supabase.from("front_desk_audit_log").insert({
        action: isDryRun ? "email_share_test" : "email_share",
        entity_type: body.record_kind,
        entity_id: body.record_id ?? "",
        performed_by: userId,
        details: {
          test_mode: isDryRun,
          source: "edge_function",
          mode: isBulk ? "bulk" : "single",
          recipient_count: recipients.length,
          sent,
          queued,
          failed,
          cc: ccList,
          bcc: bccList,
          subject: body.subject,
          // Compliance metadata — verifiable document identity
          attachment_filename: body.attachment_filename,
          attachment_sha256: body.attachment_sha256 ?? null,
          attachment_generated_at: body.attachment_generated_at ?? null,
          record_kind: body.record_kind,
          applicant_id: body.applicant_id ?? body.record_id ?? null,
          applicant_name: body.applicant_name ?? null,
          extra_attachments: extraAttachments.map((a) => ({ filename: a.filename, size: a.size })),
          extra_attachments_count: extraAttachments.length,
          extra_attachments_total_bytes: extraAttachments.reduce((s, a) => s + a.size, 0),
          sent_at: new Date().toISOString(),
          note: isDryRun ? "Simulated server-side send — no email dispatched" : undefined,
          results: results.map((r) => ({
            email: r.email,
            status: isDryRun ? "simulated" : r.status,
            message_id: r.message_id ?? null,
            error: r.error ?? null,
          })),
        },
      });
    } catch (_e) { /* ignore — audit is best-effort */ }

    return new Response(
      JSON.stringify({
        success: failed === 0,
        dry_run: isDryRun,
        summary: { total: recipients.length, sent, queued, failed },
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    console.error("send-record-email failure", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
