import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.3";

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

function buildPdf(opts: {
  title: string;
  generatedAt: string;
  summary: Record<string, string | number>;
  headers: string[];
  rows: (string | number | null)[][];
  overrides: { scope: string; qty: number; value: number }[];
}): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("GIS CYBERNET — Inventory Audit Compliance Summary", w / 2, 36, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Generated: ${opts.generatedAt}`, w / 2, 52, { align: "center" });

  // Summary block
  let y = 72;
  doc.setFontSize(10).setFont("helvetica", "bold").text("Summary", 40, y);
  y += 6;
  const summaryRows = Object.entries(opts.summary).map(([k, v]) => [k, String(v)]);
  autoTable(doc, {
    startY: y + 4,
    head: [["Metric", "Value"]],
    body: summaryRows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [13, 64, 36], textColor: 255 },
    margin: { left: 40, right: w / 2 + 10 },
  });

  if (opts.overrides.length) {
    autoTable(doc, {
      startY: y + 4,
      head: [["Per-location threshold", "Qty", "Value (₵)"]],
      body: opts.overrides.map((o) => [o.scope, o.qty, o.value]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [28, 56, 110], textColor: 255 },
      margin: { left: w / 2 + 10, right: 40 },
    });
  }

  // @ts-ignore lastAutoTable
  const startY = (doc as any).lastAutoTable.finalY + 16;
  doc.setFont("helvetica", "bold").setFontSize(10).text("Item-level variance", 40, startY);
  autoTable(doc, {
    startY: startY + 6,
    head: [opts.headers],
    body: opts.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" },
    headStyles: { fillColor: [13, 64, 36], textColor: 255 },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pg = doc.getNumberOfPages();
      doc.setFontSize(7).setTextColor(110);
      doc.text(
        `CONFIDENTIAL — GIS Amasaman Sector Command • Page ${pg}`,
        w / 2,
        doc.internal.pageSize.getHeight() - 16,
        { align: "center" },
      );
      doc.setTextColor(0);
    },
  });

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

async function postWebhook(url: string, payload: any) {
  const body = { text: payload.text ?? "Inventory variance alert", ...payload };
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

async function trySendEmail(supabase: any, to: string[], subject: string, html: string) {
  if (!to.length) return { skipped: true, reason: "no recipients" };
  try {
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: { to, subject, html, purpose: "transactional", template_name: "inventory-audit" },
    });
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
  const { data: settings } = await supabase
    .from("inventory_alert_settings")
    .select(
      "variance_qty_threshold, variance_value_threshold, webhook_url, alert_webhook_enabled, alert_email_enabled, email_recipients",
    )
    .limit(1)
    .maybeSingle();
  const { data: overrides = [] } = await supabase
    .from("inventory_alert_overrides")
    .select("scope_type, scope_value, variance_qty_threshold, variance_value_threshold, enabled")
    .eq("enabled", true);

  const overrideMap = new Map<string, { qty: number; value: number }>();
  for (const o of overrides as any[]) {
    if (o.scope_type === "location") {
      overrideMap.set(String(o.scope_value).toLowerCase(), {
        qty: o.variance_qty_threshold,
        value: Number(o.variance_value_threshold),
      });
    }
  }
  const defaultQty = settings?.variance_qty_threshold ?? 1;
  const defaultVal = Number(settings?.variance_value_threshold ?? 100);

  const latest = new Map<string, any>();
  for (const c of counts) if (!latest.has(c.item_id)) latest.set(c.item_id, c);

  const rows: any[] = [];
  let mismatched = 0;
  let netValue = 0;
  let breaches = 0;
  for (const it of items as any[]) {
    const last = latest.get(it.id);
    const phys = last ? Number(last.physical_count) : null;
    const sys = Number(it.qty_on_hand);
    const variance = phys === null ? null : phys - sys;
    const variValue = variance === null ? null : variance * Number(it.unit_cost ?? 0);
    const loc = (it.location ?? "").toLowerCase();
    const ov = overrideMap.get(loc);
    const qty_th = ov?.qty ?? defaultQty;
    const val_th = ov?.value ?? defaultVal;
    let breach = "";
    if (variance !== null && variance !== 0) {
      mismatched += 1;
      netValue += variValue ?? 0;
      const absQ = Math.abs(variance);
      const absV = Math.abs(variValue ?? 0);
      if (absQ >= qty_th || absV >= val_th) {
        breaches += 1;
        breach = "BREACH";
      }
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
      variValue === null ? "" : Number(variValue).toFixed(2),
      `${qty_th}/${val_th}`,
      breach,
      last ? new Date(last.counted_at).toISOString() : "",
    ]);
  }

  const headers = [
    "Asset Tag",
    "Item",
    "Category",
    "Location",
    "Condition",
    "System Qty",
    "Physical Count",
    "Variance",
    "Variance Value (₵)",
    "Threshold (qty/₵)",
    "Status",
    "Last Counted",
  ];

  const csv = toCsv(headers, rows);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = `inventory-audit/${stamp}-audit.csv`;
  const pdfPath = `inventory-audit/${stamp}-audit.pdf`;

  const { error: csvErr } = await supabase.storage
    .from("reports")
    .upload(csvPath, new Blob([csv], { type: "text/csv" }), {
      contentType: "text/csv",
      upsert: true,
    });
  if (csvErr) console.error("CSV upload failed", csvErr);

  let pdfOk = true;
  try {
    const pdfBytes = buildPdf({
      title: "Inventory Audit Compliance Summary",
      generatedAt: new Date().toISOString(),
      summary: {
        "Total items": items.length,
        Counted: latest.size,
        Mismatched: mismatched,
        "Threshold breaches": breaches,
        "Net variance value (₵)": Number(netValue.toFixed(2)),
        "Default thresholds": `${defaultQty} units / ₵${defaultVal}`,
        Trigger: kind,
      },
      headers,
      rows,
      overrides: (overrides as any[]).map((o) => ({
        scope: `${o.scope_type}: ${o.scope_value}`,
        qty: o.variance_qty_threshold,
        value: Number(o.variance_value_threshold),
      })),
    });
    const { error: pdfErr } = await supabase.storage
      .from("reports")
      .upload(pdfPath, new Blob([pdfBytes], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (pdfErr) {
      pdfOk = false;
      console.error("PDF upload failed", pdfErr);
    }
  } catch (e) {
    pdfOk = false;
    console.error("PDF render failed", e);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    items_total: items.length,
    counted: latest.size,
    mismatched,
    threshold_breaches: breaches,
    net_variance_value: Number(netValue.toFixed(2)),
    schedule_id: scheduleId,
    kind,
    overrides_applied: overrideMap.size,
  };

  const delivery: any = { csv_path: csvPath, pdf_path: pdfOk ? pdfPath : null };

  if (settings?.alert_webhook_enabled && settings?.webhook_url) {
    delivery.webhook = await postWebhook(settings.webhook_url, {
      text: `📦 Audit summary — ${mismatched} mismatched, ${breaches} threshold breaches, net ₵${summary.net_variance_value}`,
      summary,
    });
  }

  if (
    settings?.alert_email_enabled &&
    Array.isArray(settings?.email_recipients) &&
    settings.email_recipients.length > 0
  ) {
    const html = `
      <h2>Inventory Audit Compliance Summary</h2>
      <p>Generated: ${summary.generated_at}</p>
      <ul>
        <li>Total items: ${summary.items_total}</li>
        <li>Counted: ${summary.counted}</li>
        <li><strong>Mismatched: ${mismatched}</strong></li>
        <li>Threshold breaches: ${breaches}</li>
        <li>Net variance: ₵${summary.net_variance_value}</li>
        <li>Per-location overrides applied: ${overrideMap.size}</li>
      </ul>
      <p>CSV: <code>${csvPath}</code>${pdfOk ? ` &middot; PDF: <code>${pdfPath}</code>` : ""}</p>
    `;
    delivery.email = await trySendEmail(
      supabase,
      settings.email_recipients,
      `Inventory Audit Summary — ${stamp}`,
      html,
    );
  }

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
      report_pdf_path: pdfOk ? pdfPath : null,
      delivery_status: delivery,
    })
    .select("id")
    .maybeSingle();

  return { ...summary, csvPath, pdfPath: pdfOk ? pdfPath : null, run_id: run?.id, delivery };
}

async function dispatchVarianceAlert(supabase: any, payload: any) {
  const { data: settings } = await supabase
    .from("inventory_alert_settings")
    .select("webhook_url, alert_webhook_enabled, alert_email_enabled, email_recipients")
    .limit(1)
    .maybeSingle();

  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const locTxt = payload.item_location ? ` [${payload.item_location}]` : "";
  const thTxt = payload.threshold_qty
    ? ` (threshold ${Number(payload.threshold_qty)}/${Number(payload.threshold_value)})`
    : "";
  // Plain-text version for webhooks/subject (raw values acceptable here).
  const text = `⚠️ Variance alert: ${payload.item_name}${locTxt} — variance ${payload.variance_qty} ${payload.item_unit} (≈ ₵${payload.variance_value})${thTxt}.`;
  // HTML-escaped version for email body.
  const htmlText = `⚠️ Variance alert: ${esc(payload.item_name)}${esc(locTxt)} — variance ${esc(payload.variance_qty)} ${esc(payload.item_unit)} (≈ ₵${esc(payload.variance_value)})${esc(thTxt)}.`;
  const out: any = {};

  // Per-override webhook takes precedence over the global one
  const targetWebhook =
    payload.override_webhook && String(payload.override_webhook).trim().length > 0
      ? String(payload.override_webhook)
      : settings?.alert_webhook_enabled
        ? settings?.webhook_url
        : null;

  if (targetWebhook) {
    out.webhook = await postWebhook(targetWebhook, { text, payload });
    out.webhook_target = payload.override_webhook ? "override" : "global";
  }
  if (
    settings?.alert_email_enabled &&
    Array.isArray(settings?.email_recipients) &&
    settings.email_recipients.length > 0
  ) {
    const html = `<p>${htmlText}</p><p>Recorded count id: <code>${esc(payload.count_id)}</code></p>`;
    out.email = await trySendEmail(
      supabase,
      settings.email_recipients,
      `Inventory Variance Alert — ${String(payload.item_name ?? "").replace(/[\r\n]/g, " ").slice(0, 200)}`,
      html,
    );
  }
  return out;
}

import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

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

    if (mode === "variance_alert") {
      const result = await dispatchVarianceAlert(supabase, body);
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          last_report_pdf_path: r.pdfPath,
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
