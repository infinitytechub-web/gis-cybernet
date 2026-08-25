// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// supabase/functions/security-monitor-scan/index.ts
// Runs the security monitor scan (suspicious role changes, authorization
// failures, unusual upload/file access) and emails new alerts to admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";
import { drainDeliveryQueue, enqueueAlertDeliveries } from "../_shared/security-webhook-delivery.ts";

const RULE_LABELS: Record<string, string> = {
  role_change_burst: "Suspicious role changes",
  authorization_failure_burst: "Authorization failures",
  upload_access_anomaly: "Unusual upload / file access",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmt = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

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

  try {
    const startedAt = new Date().toISOString();
    const { data: scan, error: scanError } = await supabase.rpc("security_monitor_scan");
    if (scanError) return json({ error: "Scan failed", detail: scanError.message }, 500);

    const created = Number((scan as any)?.alerts_created ?? 0);
    if (created === 0) return json({ ...(scan as any), emailed: 0, webhooks: 0 });

    const { data: alerts } = await supabase
      .from("security_monitor_alerts")
      .select("rule_key,severity,subject_label,event_count,threshold,window_start,window_end,created_at")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!alerts || alerts.length === 0) return json({ ...(scan as any), emailed: 0, webhooks: 0 });

    // ---- Webhook delivery (severity filtered + throttled per destination) ----
    const queued = await enqueueAlertDeliveries(supabase, alerts as any);
    const drained = await drainDeliveryQueue(supabase, 20);
    const webhookResult = { ...queued, delivery: drained };

    const { data: settings } = await supabase
      .from("security_monitor_settings").select("email_alerts").limit(1).maybeSingle();
    if (!settings?.email_alerts) {
      return json({ ...(scan as any), emailed: 0, reason: "email alerts disabled", ...webhookResult });
    }

    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (admins ?? []).map((a) => a.user_id);
    if (ids.length === 0) return json({ ...(scan as any), emailed: 0, reason: "no admins", ...webhookResult });
    const { data: profiles } = await supabase.from("profiles").select("email").in("user_id", ids);
    const recipients = (profiles ?? []).map((p) => p.email).filter(Boolean) as string[];
    if (recipients.length === 0) return json({ ...(scan as any), emailed: 0, reason: "no admin emails", ...webhookResult });

    const rows = alerts.map((a) =>
      `<tr><td>${escapeHtml(fmt(a.created_at))}</td>` +
      `<td><strong>${escapeHtml(String(a.severity).toUpperCase())}</strong></td>` +
      `<td>${escapeHtml(RULE_LABELS[a.rule_key] ?? a.rule_key)}</td>` +
      `<td>${escapeHtml(String(a.subject_label ?? "—"))}</td>` +
      `<td>${a.event_count} / ${a.threshold}</td>` +
      `<td>${escapeHtml(fmt(a.window_start))} → ${escapeHtml(fmt(a.window_end))}</td></tr>`
    ).join("");

    const html = `<div style="font-family:Arial,sans-serif">
      <h2 style="color:#0a3d2e">Cybernet HRM System — Security Monitor Alerts</h2>
      <p>${alerts.length} new alert(s) raised by the security monitor.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-size:12px">
        <tr><th>When</th><th>Severity</th><th>Rule</th><th>Subject</th><th>Events</th><th>Window (UTC)</th></tr>
        ${rows}
      </table>
      <p style="font-size:11px;color:#666">Review in Admin Console → Security monitoring.</p>
    </div>`;

    let emailed = 0;
    for (const to of recipients) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            to,
            subject: `🔐 Security monitor — ${alerts.length} new alert(s)`,
            html,
            purpose: "transactional",
          }),
        });
        if (r.ok) emailed++;
      } catch { /* continue */ }
    }

    return json({ ...(scan as any), emailed, ...webhookResult });
  } catch {
    return json({ error: "Unexpected error running security monitor" }, 500);
  }
});
