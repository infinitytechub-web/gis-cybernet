// Admin-only safe restore. Upsert by primary key — never deletes existing rows.
// Body: { snapshot_id?: string, snapshot_payload?: object, tables: string[] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cybernet-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TABLES = new Set([
  "profiles", "user_roles", "departments", "ranks", "shifts",
  "shift_assignments", "attendances", "leave_requests",
  "postings_transfers", "holidays", "announcements", "app_settings",
]);

const CHUNK = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const user = u.user;

  const { data: roleRow } = await admin
    .from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    await admin.from("system_backup_restore_audit").insert({
      user_id: user.id, actor_email: user.email,
      source_label: "denied", tables_requested: [],
      status: "denied", error_message: "User is not an administrator",
      ip_address: ip, user_agent: userAgent,
    });
    return json({ error: "Forbidden — admin role required" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const requestedTables: string[] = Array.isArray(body?.tables)
    ? body.tables.filter((t: unknown) => typeof t === "string")
    : [];
  if (requestedTables.length === 0) return json({ error: "Provide 'tables' array" }, 400);

  const valid = requestedTables.filter((t) => ALLOWED_TABLES.has(t));
  if (valid.length === 0) return json({ error: "No allowed tables in request" }, 400);

  // Resolve snapshot payload
  let payload: Record<string, unknown> | null = null;
  let sourceLabel = "upload:inline";
  let snapshotId: string | null = null;

  if (typeof body?.snapshot_id === "string" && body.snapshot_id) {
    snapshotId = body.snapshot_id;
    const { data: snap, error: sErr } = await admin
      .from("system_backup_snapshots")
      .select("storage_path, file_name")
      .eq("id", snapshotId)
      .maybeSingle();
    if (sErr || !snap) return json({ error: "Snapshot not found" }, 404);
    sourceLabel = `snapshot:${snap.file_name}`;
    const { data: file, error: dErr } = await admin.storage
      .from("system-backups").download(snap.storage_path);
    if (dErr || !file) {
      console.error("system-backup-restore download error:", dErr?.message);
      return json({ error: "Failed to read snapshot" }, 500);
    }
    try {
      payload = JSON.parse(await file.text());
    } catch (e) {
      console.error("system-backup-restore JSON parse error:", (e as Error).message);
      return json({ error: "Snapshot is not valid JSON" }, 400);
    }
  } else if (body?.snapshot_payload && typeof body.snapshot_payload === "object") {
    payload = body.snapshot_payload as Record<string, unknown>;
    sourceLabel = typeof body?.source_label === "string" ? body.source_label : "upload:inline";
  } else {
    return json({ error: "Provide snapshot_id or snapshot_payload" }, 400);
  }

  const restored: string[] = [];
  const rowsWritten: Record<string, number> = {};
  let total = 0;
  const errors: string[] = [];

  for (const table of valid) {
    const rows = payload[table];
    if (!Array.isArray(rows)) {
      errors.push(`${table}: missing or invalid in snapshot`);
      continue;
    }
    if (rows.length === 0) {
      restored.push(table);
      rowsWritten[table] = 0;
      continue;
    }
    try {
      let written = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        // Upsert by id (every backed-up table has an id PK in this schema except app_settings — handled via upsert on conflict id when present)
        const { error } = await admin
          .from(table)
          .upsert(slice as any, { onConflict: "id", ignoreDuplicates: false });
        if (error) throw error;
        written += slice.length;
      }
      restored.push(table);
      rowsWritten[table] = written;
      total += written;
    } catch (e) {
      console.error(`system-backup-restore upsert error for ${table}:`, (e as Error).message);
      errors.push(`${table}: restore failed`);
    }
  }

  const status = errors.length === 0 ? "success" : (restored.length === 0 ? "error" : "partial");

  await admin.from("system_backup_restore_audit").insert({
    user_id: user.id, actor_email: user.email,
    snapshot_id: snapshotId, source_label: sourceLabel,
    tables_requested: requestedTables, tables_restored: restored,
    rows_written: rowsWritten, total_rows_written: total,
    status, error_message: errors.length ? errors.join(" | ") : null,
    ip_address: ip, user_agent: userAgent,
  });

  // Notify admins
  try {
    await admin.rpc("notify_admins", {
      _title: status === "success" ? "Restore completed" : "Restore completed with issues",
      _message: `${user.email ?? "Admin"} restored ${restored.length} table(s), ${total} row(s).`,
      _type: "general",
    });
  } catch (e) {
    console.error("notify_admins failed:", (e as Error).message);
  }

  return json({ ok: true, status, restored, rows_written: rowsWritten, total, errors });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
