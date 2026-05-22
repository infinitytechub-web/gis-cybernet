// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// Hourly dispatcher for system_backup_schedules. Claims due schedules,
// runs the same backup logic as system-backup, writes audit + snapshot rows,
// and prunes per-schedule retention.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-cybernet-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TABLES = new Set([
  "profiles","user_roles","departments","ranks","shifts",
  "shift_assignments","attendances","leave_requests",
  "postings_transfers","holidays","announcements","app_settings",
]);
const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: due, error: dueErr } = await admin.rpc("claim_due_backup_schedules");
  if (dueErr) {
    return json({ error: `claim failed: ${dueErr.message}` }, 500);
  }
  const schedules = (due ?? []) as Array<{
    id: string; name: string; frequency: string;
    tables_included: string[]; retention_days: number | null;
  }>;
  if (schedules.length === 0) {
    return json({ ok: true, processed: 0 });
  }

  const results: any[] = [];
  for (const s of schedules) {
    const valid = (s.tables_included ?? []).filter((t) => ALLOWED_TABLES.has(t));
    if (valid.length === 0) {
      await admin.rpc("mark_backup_schedule_ran", {
        _schedule_id: s.id, _status: "error",
        _error: "no allowed tables in schedule",
      });
      results.push({ id: s.id, status: "error" });
      continue;
    }

    const snapshot: Record<string, unknown> = {
      _meta: {
        generated_at: new Date().toISOString(),
        generated_by: { source: "scheduled", schedule_id: s.id, schedule_name: s.name },
        version: "1.0", tables: valid, rejected: [],
      },
    };
    const rowCounts: Record<string, number> = {};
    const exported: string[] = [];
    const errors: string[] = [];
    let totalRows = 0;

    for (const table of valid) {
      try {
        const rows: unknown[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await admin.from(table).select("*")
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        snapshot[table] = rows;
        rowCounts[table] = rows.length;
        totalRows += rows.length;
        exported.push(table);
      } catch (e) {
        errors.push(`${table}: ${(e as Error).message}`);
      }
    }

    const payload = JSON.stringify(snapshot, null, 2);
    const byteSize = new TextEncoder().encode(payload).length;
    const status = errors.length === 0 ? "success" : "partial";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `cybernet-scheduled-${s.name.replace(/[^a-z0-9_-]/gi, "_")}-${stamp}.json`;
    const storagePath = `scheduled/${stamp.slice(0, 10)}/${fileName}`;

    const { data: auditRow } = await admin.from("system_backup_audit").insert({
      user_id: null,
      actor_email: `scheduled:${s.name}`,
      tables_requested: s.tables_included,
      tables_exported: exported,
      row_counts: rowCounts,
      total_rows: totalRows,
      byte_size: byteSize,
      status,
      error_message: errors.length ? errors.join(" | ") : null,
      schedule_id: s.id,
      ip_address: null,
      user_agent: "pg_cron/run-backup-schedules",
    }).select("id").single();

    try {
      const { error: upErr } = await admin.storage.from("system-backups")
        .upload(storagePath, payload, { contentType: "application/json", upsert: false });
      if (!upErr) {
        await admin.from("system_backup_snapshots").insert({
          audit_id: auditRow?.id ?? null,
          storage_path: storagePath,
          file_name: fileName,
          byte_size: byteSize,
          tables_included: exported,
          row_counts: rowCounts,
          total_rows: totalRows,
          source: "scheduled",
          schedule_id: s.id,
          created_by: null,
          actor_email: `scheduled:${s.name}`,
        } as any);
      } else {
        errors.push(`storage upload: ${upErr.message}`);
      }
    } catch (e) {
      errors.push(`storage upload threw: ${(e as Error).message}`);
    }

    // Per-schedule retention prune
    try {
      await admin.rpc("prune_backup_schedule_history", { _schedule_id: s.id });
    } catch (e) {
      console.error("prune failed:", (e as Error).message);
    }

    await admin.rpc("mark_backup_schedule_ran", {
      _schedule_id: s.id,
      _status: errors.length === 0 ? "success" : "partial",
      _error: errors.length ? errors.join(" | ") : null,
    });

    results.push({ id: s.id, name: s.name, status, exported: exported.length, rows: totalRows });
  }

  return json({ ok: true, processed: results.length, results });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
