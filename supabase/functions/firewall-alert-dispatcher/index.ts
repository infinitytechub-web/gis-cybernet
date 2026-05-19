// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// supabase/functions/firewall-alert-dispatcher/index.ts
// Polls recent unprocessed high-severity firewall events and sends an email
// digest to all admins via the existing email queue. Safe to run every 1-5 min.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Settings
    const { data: settings } = await supabase
      .from("firewall_alert_settings").select("*").limit(1).maybeSingle();
    if (!settings?.email_alerts) {
      return new Response(JSON.stringify({ skipped: "email_alerts disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // High-severity events from the last 6 minutes
    const since = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const { data: events } = await supabase
      .from("firewall_events")
      .select("id,layer,action,subject,user_label,ip_address,created_at")
      .in("action", ["block", "quarantine"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no events" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin emails
    const { data: admins } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin");
    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no admins" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const ids = admins.map(a => a.user_id);
    const { data: profiles } = await supabase
      .from("profiles").select("email").in("user_id", ids);
    const recipients = (profiles ?? []).map(p => p.email).filter(Boolean);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no admin emails" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows = events.map(e =>
      `<tr><td>${new Date(e.created_at).toLocaleString()}</td>` +
      `<td><strong>${e.action.toUpperCase()}</strong></td>` +
      `<td>${e.layer}</td>` +
      `<td>${(e.user_label ?? "—").replace(/[<>]/g, "")}</td>` +
      `<td>${(e.subject ?? "—").slice(0, 120).replace(/[<>]/g, "")}</td></tr>`
    ).join("");

    const html = `<div style="font-family:Arial,sans-serif">
      <h2 style="color:#0a3d2e">GIS Cybernet — Firewall Alert Digest</h2>
      <p>${events.length} high-severity event(s) in the last 6 minutes.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-size:12px">
        <tr><th>When</th><th>Action</th><th>Layer</th><th>User</th><th>Subject</th></tr>
        ${rows}
      </table>
      <p style="font-size:11px;color:#666">Configure in Settings → Firewall Alerts.</p>
    </div>`;

    // Enqueue one email per admin via existing send-transactional-email
    let sent = 0;
    for (const to of recipients) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            to,
            subject: `🚨 GIS Cybernet — ${events.length} firewall alert(s)`,
            html,
            purpose: "transactional",
          }),
        });
        if (r.ok) sent++;
      } catch { /* keep going */ }
    }

    return new Response(JSON.stringify({ sent, events: events.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
