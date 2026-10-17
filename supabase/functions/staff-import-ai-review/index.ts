import { createClient } from "npm:@supabase/supabase-js@2";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";
import { buildComparison, validateRows, validateFindings } from "../_shared/import-ai/comparison.ts";
import { createImportReviewCall } from "../_shared/import-ai/responses.ts";
import { getLovableAiGatewayResponseHeaders } from "../_shared/import-ai/run-id.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cybernet-app" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function safeError(error: unknown) {
  const e = error as { statusCode?: number; responseBody?: string; message?: string };
  let message = "AI review could not be completed. No staff records were changed.";
  let denied = false;
  try {
    const body = JSON.parse(e.responseBody ?? "{}");
    message = body.error?.message ?? body.message ?? message;
    const type = body.error?.type ?? body.type;
    denied = e.statusCode === 403 && !["provider_not_available_in_region", "model_requires_retention_consent", "model_vendor_not_enabled", "credit_limit_reached"].includes(type);
  } catch { /* never expose raw provider bodies */ }
  return { status: e.statusCode && e.statusCode >= 400 && e.statusCode <= 599 ? e.statusCode : 502, message: String(message).slice(0, 500), denied };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(cors, csrf.reason);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), key = Deno.env.get("LOVABLE_API_KEY");
  if (!url || !anon || !service || !key) return json({ error: "AI review is not configured." }, 503);
  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const admin = createClient(url, service);
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Sign in to review staff imports." }, 401);
  const { data: isAdmin, error: roleError } = await caller.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (roleError || isAdmin !== true) return json({ error: "Only authorized HR import administrators may run this review." }, 403);
  try {
    if (Number(req.headers.get("Content-Length") ?? 0) > 60000) return json({ error: "Review input is too large." }, 400);
    const text = await req.text();
    if (text.length > 60000) return json({ error: "Review input is too large." }, 400);
    let rows;
    try { rows = validateRows(JSON.parse(text).rows); } catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid review rows." }, 400); }
    // Persist provider denial across requests; no automatic probes or alternate models.
    const { data: denied, error: denialReadError } = await admin.from("system_audit_log").select("action")
      .eq("entity_type", "staff_import_ai_access").in("action", ["provider_denied", "access_restored"]).order("created_at", { ascending: false }).limit(1);
    if (denialReadError) return json({ error: "Could not verify AI access." }, 503);
    if (denied?.[0]?.action === "provider_denied") return json({ error: "AI review is paused following a provider access denial. An administrator must restore AI access before a fresh review." }, 403);
    const staff = [];
    for (let start = 0; start < 10000; start += 500) {
      const { data, error } = await caller.from("profiles").select("id,first_name,last_name,staff_id,intake")
        .is("deleted_at", null).order("id").range(start, start + 499);
      if (error || !data) return json({ error: "Existing staff records could not be loaded; review is blocked." }, 503);
      staff.push(...data);
      if (data.length < 500) break;
      if (start === 9500) return json({ error: "The available staff list exceeds the comparison limit. Ask an administrator to narrow the review scope." }, 400);
    }
    const groups = buildComparison(rows, staff);
    const prompt = JSON.stringify(groups.map((g) => ({ row: { ...g.row, staff_id_raw: undefined },
      import_staff_id: g.row.staff_id_raw, candidates_truncated: g.candidatesTruncated,
      candidates: g.candidates.map((p, i) => ({ key: `R${g.row.row_no}C${i + 1}`, first_name: p.first_name, last_name: p.last_name, staff_id: p.staff_id, intake: p.intake })) })));
    const { error: auditError } = await admin.from("system_audit_log").insert({ entity_type: "staff_import_ai_review", action: "review_started", performed_by: user.id, details: { row_numbers: rows.map((r) => r.row_no), available_records: staff.length, model: "openai/gpt-6-astra" } });
    if (auditError) return json({ error: "The review could not be recorded. No AI request was sent." }, 503);
    const { result, runIdFetch } = createImportReviewCall(req, key, prompt);
    const iterator = result.fullStream[Symbol.asyncIterator]();
    const recordFailure = async (error: unknown) => {
      const failure = safeError(error);
      await admin.from("system_audit_log").insert({ entity_type: failure.denied ? "staff_import_ai_access" : "staff_import_ai_review", action: failure.denied ? "provider_denied" : "review_failed", performed_by: user.id, details: { status: failure.status } });
      return failure;
    };
    const first = await iterator.next();
    if (!first.done && first.value.type === "error") {
      const failure = await recordFailure(first.value.error);
      return json({ error: failure.message }, failure.status);
    }
    const encoder = new TextEncoder();
    const headers = getLovableAiGatewayResponseHeaders(runIdFetch.getRunId() ? { "X-Lovable-AIG-Run-ID": runIdFetch.getRunId() ?? "" } : undefined, { ...cors, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        try {
          send({ type: "progress", message: "Comparing selected rows" });
          let part = first;
          while (!part.done) {
            if (part.value.type === "error") throw part.value.error;
            if (part.value.type === "text-delta" || part.value.type === "reasoning-delta") send({ type: "progress" });
            part = await iterator.next();
          }
          const output = await result.output;
          const findings = validateFindings(output.findings, groups);
          const enriched = findings.map((f) => {
            const group = groups.find((g) => g.row.row_no === f.row_no);
            const index = group?.candidates.findIndex((_, i) => `R${f.row_no}C${i + 1}` === f.candidate_key) ?? -1;
            return { ...f, imported: group?.row, existing: index >= 0 ? group?.candidates[index] : null, candidates_truncated: group?.candidatesTruncated };
          });
          const { error } = await admin.from("system_audit_log").insert({ entity_type: "staff_import_ai_review", action: "review_completed", performed_by: user.id, details: { rows: findings.length, flagged: findings.filter((f) => f.assessment !== "no_likely_match").length, run_id: runIdFetch.getRunId() ?? null } });
          if (error) throw new Error("Audit failed");
          send({ type: "result", findings: enriched, available_records: staff.length });
        } catch (error) {
          const failure = await recordFailure(error);
          send({ type: "error", error: req.signal.aborted ? "Review stopped. No staff records were changed." : failure.message, status: req.signal.aborted ? 499 : failure.status });
        } finally { controller.close(); }
      },
      cancel() { void iterator.return?.(); },
    });
    return new Response(stream, { headers });
  } catch { return json({ error: "Staff comparison is unavailable. No staff records were changed." }, req.signal.aborted ? 499 : 503); }
});