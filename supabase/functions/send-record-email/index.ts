// Send Record Email — delivers a record PDF as an attachment using the Resend connector.
// Gracefully reports a "not configured" error if the connector isn't linked yet.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

interface SendBody {
  to: string;
  subject: string;
  message: string;
  attachment_base64: string;
  attachment_filename: string;
  record_kind: string;
  record_id?: string;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

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
    if (!body?.to || !isValidEmail(body.to)) errors.push("to");
    if (!body?.subject || body.subject.length > 255) errors.push("subject");
    if (!body?.message || body.message.length > 10_000) errors.push("message");
    if (!body?.attachment_base64 || body.attachment_base64.length < 50) errors.push("attachment_base64");
    if (!body?.attachment_filename) errors.push("attachment_filename");
    if (!body?.record_kind) errors.push("record_kind");
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

    // Send via Resend connector gateway
    const resendResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Ghana Immigration Service <onboarding@resend.dev>",
        to: [body.to],
        subject: body.subject,
        text: body.message,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>${body.message.replace(/\n/g, "<br/>")}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="font-size:12px;color:#64748b">
            Ghana Immigration Service — Amasaman Sector Command · Cybernet
          </p>
        </div>`,
        attachments: [
          {
            filename: body.attachment_filename,
            content: body.attachment_base64,
          },
        ],
      }),
    });

    const respText = await resendResp.text();
    if (!resendResp.ok) {
      console.error("Resend gateway error", resendResp.status, respText);
      return new Response(
        JSON.stringify({
          error: `Email provider error [${resendResp.status}]: ${respText.slice(0, 400)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Audit trail — best effort
    try {
      await supabase.from("front_desk_audit_log").insert({
        action: "email_share",
        entity_type: body.record_kind,
        entity_id: body.record_id ?? "",
        performed_by: userId,
        details: { recipient: body.to, subject: body.subject },
      });
    } catch (_e) { /* ignore — audit is best-effort */ }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("send-record-email failure", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
