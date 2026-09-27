// Admin-only: summarises staff deletion/restore/purge history and flags unusual patterns.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasStaffAdminAuthority, STAFF_ADMIN_DENIED } from "../_shared/staff-admin-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ACTIONS = ["soft_deleted_staff", "restored_staff", "purged_staff", "deleted_staff_account", "disabled_account", "reenabled_account"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    if (!(await hasStaffAdminAuthority(admin, u.user.id))) return json({ error: STAFF_ADMIN_DENIED }, 403);

    const body = await req.json().catch(() => ({}));
    const staffQuery = String(body.staff ?? "").trim().slice(0, 80);
    const notes = String(body.notes ?? "").trim().slice(0, 4000);
    const days = Math.min(Math.max(Number(body.days) || 90, 1), 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let q = admin.from("system_audit_log")
      .select("action, entity_id, performed_by, created_at, details")
      .in("action", ACTIONS).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(400);
    if (staffQuery) {
      const { data: prof } = await admin.from("profiles").select("id")
        .or(`staff_id.ilike.%${staffQuery.replace(/[%,()]/g, "")}%,last_name.ilike.%${staffQuery.replace(/[%,()]/g, "")}%`)
        .limit(20);
      const ids = (prof ?? []).map((p: { id: string }) => p.id);
      if (!ids.length && !notes) return json({ summary: "No matching staff record found.", eventCount: 0 });
      if (ids.length) q = q.in("entity_id", ids);
    }
    const { data: events, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const actorIds = [...new Set((events ?? []).map((e: any) => e.performed_by).filter(Boolean))];
    const { data: actors } = actorIds.length
      ? await admin.from("profiles").select("user_id, first_name, last_name").in("user_id", actorIds)
      : { data: [] };
    const nameOf = new Map((actors ?? []).map((a: any) => [a.user_id, `${a.last_name ?? ""} ${a.first_name ?? ""}`.trim()]));
    const lines = (events ?? []).map((e: any) =>
      `${e.created_at} | ${e.action} | staff ${e.details?.staff_id ?? e.entity_id ?? "?"} ${e.details?.name ?? ""} | by ${nameOf.get(e.performed_by) || String(e.performed_by).slice(0, 8)} | reason: ${e.details?.reason ?? "—"}`
    );

    await admin.from("system_audit_log").insert({
      action: "ai_deletion_insights", entity_type: "staff_account", performed_by: u.user.id,
      details: { staff: staffQuery || null, days, events: lines.length },
    });

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured" }, 500);
    const prompt = `You audit staff-record deletions for a government HR system. Using the event log and administrator notes below, write:
1. "Summary" — a concise timeline of what happened (max 8 bullets).
2. "Unusual patterns" — flag bursts of deletions by one person, deletions soon followed by restores, repeated delete/restore of the same officer, purges, off-hours activity (before 06:00 or after 20:00 UTC), vague or missing reasons. Say "None detected" if nothing stands out.
3. "Recommended follow-up" — up to 3 short actions.
Use plain markdown. Do not invent events.

Window: last ${days} days. Staff filter: ${staffQuery || "all"}.
Administrator notes: ${notes || "none"}
Events (${lines.length}):
${lines.join("\n") || "none"}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", input: prompt, stream: true, store: false,
        reasoning: { effort: "low" },
      }),
    });
    if (!r.ok || !r.body) {
      const t = await r.text();
      const msg = r.status === 429 ? "AI is busy, try again shortly." : r.status === 402 ? "AI credits exhausted. Top up in Settings → Plans & credits." : `AI request failed: ${t.slice(0, 300)}`;
      return json({ error: msg }, r.status);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          if (ev.type === "error" || ev.type === "response.failed") return json({ error: "AI request failed" }, 502);
        } catch { /* ignore */ }
      }
    }
    return json({ summary: out || "The model returned no text.", eventCount: lines.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
