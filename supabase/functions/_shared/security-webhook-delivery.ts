// Shared delivery pipeline for security-alert webhooks.
// Enqueues payloads, then drains the queue with HMAC signing, exponential
// backoff (handled by security_webhook_settle_delivery) and a dead-letter state.

export const RULE_LABELS: Record<string, string> = {
  role_change_burst: "Suspicious role changes",
  authorization_failure_burst: "Authorization failures",
  upload_access_anomaly: "Unusual upload / file access",
};

export const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "\u{1F6A8}",
  high: "\u26A0\uFE0F",
  medium: "\u{1F535}",
};

export type AlertRow = {
  rule_key: string;
  severity: string;
  subject_label: string | null;
  event_count: number;
  threshold: number;
  window_start: string;
  window_end: string;
  created_at: string;
};

const fmt = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

const topSeverity = (alerts: AlertRow[]) =>
  alerts.reduce((acc, a) => ((SEVERITY_RANK[a.severity] ?? 0) > (SEVERITY_RANK[acc] ?? 0) ? a.severity : acc), "medium");

export function slackPayload(alerts: AlertRow[]) {
  const top = topSeverity(alerts);
  const header = `${SEVERITY_EMOJI[top] ?? "\u{1F510}"} Security monitor — ${alerts.length} new ${top} alert(s)`;
  const blocks: unknown[] = [{ type: "header", text: { type: "plain_text", text: header.slice(0, 150) } }];
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
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Review in Admin Console \u2192 Security monitoring." }] });
  return { text: header, blocks };
}

export function genericPayload(alerts: AlertRow[]) {
  return {
    source: "cybernet-security-monitor",
    generated_at: new Date().toISOString(),
    alert_count: alerts.length,
    top_severity: topSeverity(alerts),
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

/** HMAC-SHA256 over `${timestamp}.${body}` — receivers recompute this to verify the sender. */
export async function signPayload(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Queue one payload per enabled destination whose minimum severity matches,
 * respecting the per-destination throttle window.
 */
export async function enqueueAlertDeliveries(supabase: any, alerts: AlertRow[]) {
  const { data: hooks } = await supabase
    .from("security_monitor_webhooks")
    .select("id,kind,min_severity,throttle_minutes,enabled,last_sent_at")
    .eq("enabled", true);

  let queued = 0;
  let throttled = 0;
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

    const payload = h.kind === "slack" ? slackPayload(matching) : genericPayload(matching);
    const { error } = await supabase.from("security_webhook_deliveries").insert({
      webhook_id: h.id,
      payload,
      alert_count: matching.length,
      top_severity: topSeverity(matching),
    });
    if (!error) queued++;
  }

  return { webhooks_queued: queued, webhooks_throttled: throttled };
}

/**
 * Drain a bounded batch of due deliveries. Claiming is single-flight in the
 * database (FOR UPDATE SKIP LOCKED + lease), retries use exponential backoff,
 * and exhausted deliveries are dead-lettered rather than dropped.
 */
export async function drainDeliveryQueue(supabase: any, limit = 20) {
  const { data: claimed, error } = await supabase.rpc("security_webhook_claim_deliveries", { _limit: limit });
  if (error) return { delivered: 0, retried: 0, dead_lettered: 0, error: "claim failed" };

  let delivered = 0;
  let retried = 0;
  let dead = 0;

  for (const d of claimed ?? []) {
    const body = JSON.stringify(d.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Cybernet-Timestamp": timestamp,
      "X-Cybernet-Delivery": d.id,
      "X-Cybernet-Attempt": String(d.attempts),
    };
    if (d.signing_secret) {
      headers["X-Cybernet-Signature"] = `sha256=${await signPayload(d.signing_secret, timestamp, body)}`;
    }

    let ok = false;
    let statusText = "error";
    let errText: string | null = null;
    try {
      const res = await fetch(d.url, { method: "POST", headers, body });
      ok = res.ok;
      statusText = ok ? `ok ${res.status}` : `error ${res.status}`;
      if (!ok) errText = (await res.text()).slice(0, 400);
    } catch (e) {
      errText = String(e).slice(0, 400);
    }

    const { data: outcome } = await supabase.rpc("security_webhook_settle_delivery", {
      _id: d.id,
      _ok: ok,
      _status: statusText,
      _error: errText,
    });

    if (outcome === "delivered") delivered++;
    else if (outcome === "dead") dead++;
    else retried++;
  }

  return { delivered, retried, dead_lettered: dead, claimed: (claimed ?? []).length };
}
