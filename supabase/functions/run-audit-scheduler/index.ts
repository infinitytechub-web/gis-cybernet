import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

async function postWebhook(url: string, payload: any) {
  // Slack/Teams/Discord-compatible: send `text` plus structured JSON
  const body = {
    text: payload.text ?? "Inventory variance alert",
    ...payload,
  };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function trySendEmail(
  supabase: any,
  to: string[],
  subject: string,
  html: string,
) {
  if (!to.length) return { skipped: true, reason: "no recipients" };
  try {
    // Will succeed once Lovable email infra is provisioned; otherwise returns error.
    const { data, error } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          to,
          subject,
          html,
          purpose: "transactional",
          template_name: "inventory-audit",
        },
      },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function nextRunAt(freq: string, from = new Date()): Date {
  const d = new Date(from);
  switch (freq) {
    case "hourly":
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      return d;
    case "daily":
      d.setUTCHours(6, 0, 0, 0);
      if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "weekly":
      d.setUTCHours(6, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + ((1 + 7 - d.getUTCDay()) % 7 || 7));
      return d;
    case "monthly":
      d.setUTCHours(6, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      return d;
    default:
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
  }
}

async function runAuditForSchedule(
  supabase: any,
  scheduleId: string | null,
  triggeredBy: string | null,
  kind: "scheduled" | "manual",
) {
  // Fetch items and latest counts
  const { data: items = [] } = await supabase
    .from("inventory_items")
    .select(
      "id, asset_tag, name, qty_on_hand, unit, unit_cost, location, condition, inventory_categories(name)",
    );
  const { data: counts = [] } = await supabase
    .from("inventory_audit_counts")
    .select("item_id, physical_count, system_qty, variance, counted_at")
    .order("counted_at", { ascending: false })
    .limit(5000);

  const latest = new Map<string, any>();
  for (const c of counts) if (!latest.has(c.item_id)) latest.set(c.item_id, c);

  const rows: any[] = [];
  let mismatched = 0;
  let netValue = 0;
  for (const it of items as any[]) {
    const last = latest.get(it.id);
    const phys = last ? Number(last.physical_count) : null;
    const sys = Number(it.qty_on_hand);
    const variance = phys === null ? null : phys - sys;
    const variValue =
      variance === null ? null : variance * Number(it.unit_cost ?? 0);
    if (variance !== null && variance !== 0) {
      mismatched += 1;
      netValue += variValue ?? 0;
    }
    rows.push([
      it.asset_tag ?? "",
      it.name,
      it.inventory_categories?.name ?? "",
      it.location ?? "",
      it.condition ?? "",
      sys,
      phys ?? "",
      variance ?? "",
      variValue === null ? "" : variValue.toFixed(2),
      last ? new Date(last.counted_at).toISOString() : "",
    ]);
  }

  const csv = toCsv(
    [
      "Asset Tag",
      "Item",
      "Category",
      "Location",
      "Condition",
      "System Qty",
      "Physical Count",
      "Variance",
      "Variance Value (₵)",
      "Last Counted",
    ],
    rows,
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = `inventory-audit/${stamp}-audit.csv`;
  const { error: upErr } = await supabase.storage
    .from("reports")
    .upload(csvPath, new Blob([csv], { type: "text/csv" }), {
      contentType: "text/csv",
      upsert: true,
    });
  if (upErr) console.error("CSV upload failed", upErr);

  const summary = {
    generated_at: new Date().toISOString(),
    items_total: items.length,
    counted: latest.size,
    mismatched,
    net_variance_value: Number(netValue.toFixed(2)),
    schedule_id: scheduleId,
    kind,
  };

  // Settings
  const { data: settings } = await supabase
    .from("inventory_alert_settings")
    .select(
      "webhook_url, alert_webhook_enabled, alert_email_enabled, email_recipients",
    )
    .limit(1)
    .maybeSingle();

  const delivery: any = { csv_path: csvPath };

  // Webhook
  if (settings?.alert_webhook_enabled && settings?.webhook_url) {
    delivery.webhook = await postWebhook(settings.webhook_url, {
      text: `📦 Inventory audit summary — ${mismatched} mismatched item(s), net variance ₵${summary.net_variance_value}`,
      summary,
    });
  }

  // Email
  if (
    settings?.alert_email_enabled &&
    Array.isArray(settings?.email_recipients) &&
    settings.email_recipients.length > 0
  ) {
    const html = `
      <h2>Inventory Audit Summary</h2>
      <p>Generated: ${summary.generated_at}</p>
      <ul>
        <li>Total items: ${summary.items_total}</li>
        <li>Counted: ${summary.counted}</li>
        <li><strong>Mismatched: ${mismatched}</strong></li>
        <li>Net variance: ₵${summary.net_variance_value}</li>
      </ul>
      <p>Full CSV: <code>${csvPath}</code> (in Reports bucket).</p>
    `;
    delivery.email = await trySendEmail(
      supabase,
      settings.email_recipients,
      `Inventory Audit Summary — ${stamp}`,
      html,
    );
  }

  // Insert run record
  const { data: run } = await supabase
    .from("inventory_audit_runs")
    .insert({
      schedule_id: scheduleId,
      triggered_by: triggeredBy,
      triggered_kind: kind,
      mismatched_count: mismatched,
      net_variance_value: Number(netValue.toFixed(2)),
      summary_json: summary,
      report_csv_path: csvPath,
      delivery_status: delivery,
    })
    .select("id")
    .maybeSingle();

  return { ...summary, csvPath, run_id: run?.id, delivery };
}

async function dispatchVarianceAlert(supabase: any, payload: any) {
  const { data: settings } = await supabase
    .from("inventory_alert_settings")
    .select(
      "webhook_url, alert_webhook_enabled, alert_email_enabled, email_recipients",
    )
    .limit(1)
    .maybeSingle();

  const text = `⚠️ Variance alert: ${payload.item_name} — variance ${payload.variance_qty} ${payload.item_unit} (≈ ₵${payload.variance_value}).`;
  const out: any = {};

  if (settings?.alert_webhook_enabled && settings?.webhook_url) {
    out.webhook = await postWebhook(settings.webhook_url, { text, payload });
  }
  if (
    settings?.alert_email_enabled &&
    Array.isArray(settings?.email_recipients) &&
    settings.email_recipients.length > 0
  ) {
    const html = `<p>${text}</p><p>Recorded count id: <code>${payload.count_id}</code></p>`;
    out.email = await trySendEmail(
      supabase,
      settings.email_recipients,
      `Inventory Variance Alert — ${payload.item_name}`,
      html,
    );
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const mode = body?.mode ?? "tick";

    // Variance fan-out from DB trigger
    if (mode === "variance_alert") {
      const result = await dispatchVarianceAlert(supabase, body);
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manual run (called from UI)
    if (mode === "manual") {
      const result = await runAuditForSchedule(
        supabase,
        body.schedule_id ?? null,
        body.triggered_by ?? null,
        "manual",
      );
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: cron tick — run all due schedules
    const { data: due = [] } = await supabase
      .from("inventory_audit_schedules")
      .select("id, frequency, enabled, next_run_at")
      .eq("enabled", true)
      .lte("next_run_at", new Date().toISOString());

    const results: any[] = [];
    for (const s of due as any[]) {
      const r = await runAuditForSchedule(supabase, s.id, null, "scheduled");
      const next = nextRunAt(s.frequency).toISOString();
      await supabase
        .from("inventory_audit_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: next,
          last_report_path: r.csvPath,
        })
        .eq("id", s.id);
      results.push({ schedule_id: s.id, ...r, next_run_at: next });
    }

    return new Response(
      JSON.stringify({ ok: true, ran: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
