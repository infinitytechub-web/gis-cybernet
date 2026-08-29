// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// supabase/functions/biometric-enrollment-reminders/index.ts
// Scheduled biometric enrollment reminders. Runs hourly; the database routine
// decides whether this hour is the configured send hour, who is still in the
// grace period or overdue, and which reminders are due (respecting the
// configured repeat intervals). This function only delivers the queued emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

interface EmailJob {
  log_id: string;
  user_id: string;
  to: string;
  subject: string;
  body: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let force = false;
  try {
    const body = await req.json();
    force = Boolean(body?.force);
  } catch {
    /* no body — scheduled run */
  }

  try {
    const { data, error } = await supabase.rpc("biometric_reminder_run", { _force: force });
    if (error) return json({ error: "Reminder run failed", detail: error.message }, 500);

    // deno-lint-ignore no-explicit-any
    const result = (data ?? {}) as any;
    const jobs: EmailJob[] = Array.isArray(result.emails) ? result.emails : [];
    if (!result.ran || jobs.length === 0) {
      return json({ ...result, emails: undefined, sent: 0 });
    }

    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
        <h2 style="color:#0a3d2e;margin-bottom:8px">${escapeHtml(job.subject)}</h2>
        <p style="line-height:1.6">${escapeHtml(job.body).replace(/\n/g, "<br/>")}</p>
        <p style="font-size:12px;color:#6b7280">Open the app and go to Biometric Enrolment on the device
        you want to use. Passkeys can only be created on your own device.</p>
      </div>`;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            to: job.to,
            subject: job.subject,
            html,
            purpose: "transactional",
          }),
        });
        const ok = r.ok;
        const detail = ok ? null : `HTTP ${r.status}`;
        await supabase.rpc("biometric_reminder_mark", {
          _log_id: job.log_id,
          _ok: ok,
          _detail: detail,
        });
        if (ok) sent++;
        else failed++;
      } catch (e) {
        failed++;
        await supabase.rpc("biometric_reminder_mark", {
          _log_id: job.log_id,
          _ok: false,
          _detail: e instanceof Error ? e.message : "send failed",
        });
      }
    }

    return json({ ...result, emails: undefined, sent, failed });
  } catch {
    return json({ error: "Unexpected error sending biometric reminders" }, 500);
  }
});
