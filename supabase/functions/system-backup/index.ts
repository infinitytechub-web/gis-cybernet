// Admin-only system backup edge function.
// - Verifies caller JWT, looks up user_roles, requires role 'admin'.
// - Uses SERVICE_ROLE to read selected tables under server-side policy.
// - Writes a row to system_backup_audit for every attempt (success or failure).
// - Returns the JSON snapshot to the caller for download.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Server-side allow-list of tables that may be exported. Anything else is rejected.
const ALLOWED_TABLES = new Set([
  "profiles",
  "user_roles",
  "departments",
  "ranks",
  "shifts",
  "shift_assignments",
  "attendances",
  "leave_requests",
  "postings_transfers",
  "holidays",
  "announcements",
  "app_settings",
]);

const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // Auth client for resolving the caller
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const user = userData.user;

  // Server-side admin check (do NOT trust the client).
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr || !roleRow) {
    await admin.from("system_backup_audit").insert({
      user_id: user.id,
      actor_email: user.email,
      tables_requested: [],
      tables_exported: [],
      status: "denied",
      error_message: "User is not an administrator",
      ip_address: ip,
      user_agent: userAgent,
    });
    return json({ error: "Forbidden — admin role required" }, 403);
  }

  // Parse + validate body
  let body: { tables?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const requested = Array.isArray(body.tables)
    ? (body.tables as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  if (requested.length === 0) {
    return json({ error: "Provide a non-empty 'tables' array" }, 400);
  }

  const valid = requested.filter((t) => ALLOWED_TABLES.has(t));
  const rejected = requested.filter((t) => !ALLOWED_TABLES.has(t));
  if (valid.length === 0) {
    await admin.from("system_backup_audit").insert({
      user_id: user.id,
      actor_email: user.email,
      tables_requested: requested,
      tables_exported: [],
      status: "rejected",
      error_message: `No allowed tables in request. Rejected: ${rejected.join(", ")}`,
      ip_address: ip,
      user_agent: userAgent,
    });
    return json({ error: "No allowed tables in request", rejected }, 400);
  }

  // Build snapshot
  const snapshot: Record<string, unknown> = {
    _meta: {
      generated_at: new Date().toISOString(),
      generated_by: { user_id: user.id, email: user.email },
      version: "1.0",
      tables: valid,
      rejected,
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
        const { data, error } = await admin
          .from(table)
          .select("*")
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
      const msg = (e as Error).message ?? "unknown error";
      snapshot[table] = { error: msg };
      errors.push(`${table}: ${msg}`);
    }
  }

  const payload = JSON.stringify(snapshot, null, 2);
  const byteSize = new TextEncoder().encode(payload).length;

  const status = errors.length === 0 ? "success" : "partial";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `cybernet-backup-${stamp}.json`;
  const storagePath = `auto/${stamp.slice(0, 10)}/${fileName}`;

  // Audit (best-effort; do not fail the response if audit write fails)
  const { data: auditRow, error: auditErr } = await admin
    .from("system_backup_audit")
    .insert({
      user_id: user.id,
      actor_email: user.email,
      tables_requested: requested,
      tables_exported: exported,
      row_counts: rowCounts,
      total_rows: totalRows,
      byte_size: byteSize,
      status,
      error_message: errors.length ? errors.join(" | ") : null,
      ip_address: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();
  if (auditErr) {
    console.error("Failed to write backup audit:", auditErr.message);
  }

  // Archive snapshot to private storage so admins can browse/restore later
  let snapshotId: string | null = null;
  try {
    const { error: upErr } = await admin.storage
      .from("system-backups")
      .upload(storagePath, payload, {
        contentType: "application/json",
        upsert: false,
      });
    if (upErr) {
      console.error("Snapshot upload failed:", upErr.message);
    } else {
      const { data: snapRow, error: snapErr } = await admin
        .from("system_backup_snapshots")
        .insert({
          audit_id: auditRow?.id ?? null,
          storage_path: storagePath,
          file_name: fileName,
          byte_size: byteSize,
          tables_included: exported,
          row_counts: rowCounts,
          total_rows: totalRows,
          source: "auto",
          created_by: user.id,
          actor_email: user.email,
        } as any)
        .select("id")
        .single();
      if (snapErr) console.error("Snapshot index failed:", snapErr.message);
      else snapshotId = snapRow?.id ?? null;
    }
  } catch (e) {
    console.error("Snapshot archive threw:", (e as Error).message);
  }

  // Notify admins about this backup event (in-app)
  try {
    await admin.rpc("notify_admins", {
      _title: status === "success" ? "Backup completed" : "Backup completed with warnings",
      _message: `${user.email ?? "Admin"} exported ${exported.length} table(s), ${totalRows} row(s).`,
      _type: "general",
    });
  } catch (e) {
    console.error("notify_admins failed:", (e as Error).message);
  }

  // Enforce retention (writes its own cleanup audit + admin notification)
  try {
    const { error: pruneErr } = await admin.rpc("prune_system_backup_audit");
    if (pruneErr) console.error("Prune failed:", pruneErr.message);
  } catch (e) {
    console.error("Prune threw:", (e as Error).message);
  }

  return new Response(payload, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Backup-Status": status,
      "X-Backup-Tables": exported.join(","),
      "X-Backup-Rows": String(totalRows),
      "X-Backup-Snapshot-Id": snapshotId ?? "",
      "X-Backup-Audit-Id": auditRow?.id ?? "",
    },
  });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
