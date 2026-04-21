// Send Record Email — delivers a record PDF as an attachment using the Resend connector.
// Supports single and bulk send modes. Returns per-recipient outcome + provider message ids.

import { createClient } from "jsr:@supabase/supabase-js@2";

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

    // Connector credentials
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
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

    const htmlBody = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>${body.message.replace(/\n/g, "<br/>")}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="font-size:12px;color:#64748b">
          Ghana Immigration Service — Amasaman Sector Command · Cybernet
        </p>
      </div>`;

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

    // Throttled sequential send (avoid hammering gateway)
    const results: RecipientResult[] = [];
    for (const r of recipients) {
      const res = await sendOne(r);
      results.push(res);
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const queued = results.filter((r) => r.status === "queued").length;
    const failed = results.filter((r) => r.status === "failed").length;

    // Audit trail — best effort, per-recipient summary + message ids
    try {
      await supabase.from("front_desk_audit_log").insert({
        action: "email_share",
        entity_type: body.record_kind,
        entity_id: body.record_id ?? "",
        performed_by: userId,
        details: {
          mode: isBulk ? "bulk" : "single",
          recipient_count: recipients.length,
          sent,
          queued,
          failed,
          cc: ccList,
          bcc: bccList,
          subject: body.subject,
          results: results.map((r) => ({
            email: r.email,
            status: r.status,
            message_id: r.message_id ?? null,
            error: r.error ?? null,
          })),
        },
      });
    } catch (_e) { /* ignore — audit is best-effort */ }

    return new Response(
      JSON.stringify({
        success: failed === 0,
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
