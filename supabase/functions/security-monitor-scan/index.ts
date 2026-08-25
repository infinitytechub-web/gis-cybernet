// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// supabase/functions/security-monitor-scan/index.ts
// Runs the security monitor scan (suspicious role changes, authorization
// failures, unusual upload/file access) and emails new alerts to admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

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

type AlertRow = {
  rule_key: string;
  severity: string;
  subject_label: string | null;
  event_count: number;
  threshold: number;
  window_start: string;
  window_end: string;
  created_at: string;
};

const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEVERITY_EMOJI: Record<string, string> = { critical: "\u{1F6A8}", high: "\u26A0\uFE0F", medium: "\u{1F535}" };

function slackPayload(alerts: AlertRow[]) {
  const top = alerts.reduce(
    (acc, a) => ((SEVERITY_RANK[a.severity] ?? 0) > (SEVERITY_RANK[acc] ?? 0) ? a.severity : acc),
    "medium",
  );
  const header = `${SEVERITY_EMOJI[top] ?? "\u{1F510}"} Security monitor — ${alerts.length} new ${top} alert(s)`;
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: header.slice(0, 150) } },
  ];
  for (const a of alerts.slice(0, 10)) {
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Rule*\n${RULE_LABELS[a.rule_key] ?? a.rule_key}` },
        { type: "mrkdwn", text: `*Severity*\n${String(a.severity).toUpperCase()}` },
        { type: "mrkdwn", text: `*Subject*\n${a.subject_label ?? "unknown"}` },
        { type: "mrkdwn", text: `*Events*\n${a.event_count} (threshold ${a.threshold})` },
        { type: "mrkdwn", text: `*Window (UTC)*\n${fmt(a.window_start)} \u2192 ${fmt(a.window_end)}` },
      ],
    });
  }
  if (alerts.length > 10) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `\u2026 and ${alerts.length - 10} more alert(s)` }] });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Review in Admin Console \u2192 Security monitoring." }],
  });
  return { text: header, blocks };
}

function genericPayload(alerts: AlertRow[]) {
  return {
    source: "cybernet-security-monitor",
    generated_at: new Date().toISOString(),
    alert_count: alerts.length,
    alerts: alerts.map((a) => ({
      rule: a.rule_key,
      rule_label: RULE_LABELS[a.rule_key] ?? a.rule_key,
      severity: a.severity,
      subject: a.subject_label,
      event_count: a.event_count,
      threshold: a.threshold,
      window_start: a.window_start,
      window_end: a.window_end,
      raised_at: a.created_at,
    })),
  };
}

async function deliverWebhooks(supabase: any, alerts: AlertRow[]) {
  const { data: hooks } = await supabase
    .from("security_monitor_webhooks")
    .select("id,label,kind,url,min_severity,throttle_minutes,enabled,last_sent_at")
    .eq("enabled", true);

  let delivered = 0;
  let throttled = 0;
  let failed = 0;
  const now = Date.now();

  for (const h of hooks ?? []) {
    const floor = SEVERITY_RANK[h.min_severity] ?? 3;
    const matching = alerts.filter((a) => (SEVERITY_RANK[a.severity] ?? 0) >= floor);
    if (matching.length === 0) continue;

    const throttleMs = Math.max(Number(h.throttle_minutes ?? 0), 0) * 60_000;
    if (throttleMs > 0 && h.last_sent_at && now - new Date(h.last_sent_at).getTime() < throttleMs) {
      throttled++;
      continue;
    }

    const body = h.kind === "slack" ? slackPayload(matching) : genericPayload(matching);
    try {
      const res = await fetch(h.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        delivered++;
        await supabase.from("security_monitor_webhooks")
          .update({ last_sent_at: new Date().toISOString(), last_status: `ok ${res.status}`, last_error: null })
          .eq("id", h.id);
      } else {
        failed++;
        await supabase.from("security_monitor_webhooks")
          .update({ last_status: `error ${res.status}`, last_error: (await res.text()).slice(0, 300) })
          .eq("id", h.id);
      }
    } catch (e) {
      failed++;
      await supabase.from("security_monitor_webhooks")
        .update({ last_status: "error", last_error: String(e).slice(0, 300) })
        .eq("id", h.id);
    }
  }

  return { webhooks: delivered, webhooks_throttled: throttled, webhooks_failed: failed };
}

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
    const webhookResult = await deliverWebhooks(supabase, alerts);

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
