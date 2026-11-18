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

// Privilege-bearing tables may only be restored from server-created snapshots
// (stored in the private system-backups bucket), never from caller-supplied
// inline payloads, so an uploaded file can't inject roles or profile fields.
const SNAPSHOT_ONLY_TABLES = new Set(["profiles", "user_roles", "app_settings"]);
const COLUMN_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Protected fields that must never be rewritten by a restore.
const PROTECTED_FIELDS: Record<string, Set<string>> = {
  profiles: new Set(["user_id", "email", "login_enabled", "mfa_secret", "mfa_backup_codes"]),
  user_roles: new Set([]),
};

// Fixed allow-list of restorable columns per table (snapshot of the schema).
// Keys outside this list are dropped, so a payload cannot write unlisted fields.
const WRITABLE_COLUMNS: Record<string, Set<string>> = {
  announcements: new Set(["content", "created_at", "created_by", "department_id", "expires_at", "id", "is_active", "priority", "title", "updated_at"]),
  app_settings: new Set(["accent_color", "allow_self_registration", "announcement_file_cleanup_last_run_at", "announcement_file_cleanup_mode", "announcement_file_retention_days_department", "announcement_file_retention_days_global", "announcement_file_retention_enabled", "auto_logout_minutes", "auto_logout_warning_seconds", "biometric_enrollment_enforced_at", "biometric_enrollment_grace_days", "biometric_enrollment_required", "biometric_login_enabled", "biometric_required_roles", "biometric_stepup_required", "company_name", "contact_address", "contact_email", "contact_phone", "contact_website", "created_at", "dashboard_logo_url", "email_footer_text", "email_from_name", "email_header_color", "email_logo_url", "email_reply_to", "email_signature", "enable_system_health_widget", "enforce_password_change", "favicon_url", "footer_text", "header_text", "height_max_cm", "height_min_cm", "id", "lockout_auto_unlock_minutes", "lockout_threshold", "lockout_window_minutes", "login_background_url", "login_logo_url", "login_tagline", "logo_url", "max_concurrent_sessions", "mfa_grace_days", "mfa_required_roles", "min_password_length", "org_name", "password_min_strength", "password_require_lower", "password_require_number", "password_require_symbol", "password_require_upper", "primary_color", "recaptcha_enabled", "recaptcha_min_score", "recaptcha_site_key", "secondary_color", "security_scan_enabled", "security_scan_frequency", "security_scan_last_run_at", "session_absolute_hours", "staff_id_mask_rules", "system_description", "system_label", "updated_at"]),
  attendances: new Set(["check_in", "check_in_address", "check_in_device", "check_in_ip", "check_in_lat", "check_in_lng", "check_in_method", "check_in_photo_path", "check_in_reason", "check_out", "check_out_address", "check_out_device", "check_out_ip", "check_out_lat", "check_out_lng", "check_out_method", "check_out_photo_path", "check_out_reason", "created_at", "date", "id", "notes", "profile_id", "status", "updated_at"]),
  departments: new Set(["created_at", "description", "icon", "id", "name", "parent_department_id"]),
  holidays: new Set(["created_at", "date", "id", "name", "recurring"]),
  leave_requests: new Set(["approved_by", "attachment_path", "comments", "created_at", "decided_at", "department_id", "end_date", "id", "profile_id", "reason", "reason_category", "shift_group", "start_date", "status", "type", "updated_at"]),
  postings_transfers: new Set(["approved_by", "attachment_path", "created_at", "effective_date", "from_department_id", "id", "profile_id", "remarks", "status", "to_department_id", "type", "updated_at"]),
  profiles: new Set(["account_locked", "blood_group", "cadet_intake", "created_at", "current_appointment", "current_place_of_stay", "date_joined_service", "date_of_appointment", "date_of_birth", "deactivated_at", "deactivated_by", "deactivation_reason", "deleted_at", "deleted_by", "deletion_reason", "department_id", "digital_address", "dob_verification_note", "dob_verification_status", "dob_verified_at", "dob_verified_by", "email", "first_name", "form_completed_on", "gender", "ghana_card_number", "grade_id", "height_cm", "hobbies", "hometown", "id", "intake", "is_minor", "is_number", "last_name", "login_enabled", "marital_status", "minor_review_reason", "minor_reviewed_at", "minor_reviewed_by", "minor_status", "number_of_children", "office", "org_unit_id", "other_names", "phone", "photo_url", "place_of_birth", "postal_address", "previous_last_position", "previous_reason_for_leaving", "rank_id", "recruit_intake", "region_of_origin", "religion", "residential_address", "residential_phone", "retirement_age", "sector_command", "service_organization", "service_region", "shift_group", "shoe_size", "special_skills", "staff_category", "staff_id", "station_unit", "status", "training_designation", "training_designation_other", "uniform_size", "unit", "updated_at", "user_id", "weapon_trained", "weapon_training_date"]),
  ranks: new Set(["abbreviation", "category_id", "created_at", "id", "level", "name", "sort_order"]),
  shift_assignments: new Set(["created_at", "end_date", "id", "profile_id", "shift_id", "start_date"]),
  shifts: new Set(["created_at", "description", "end_time", "id", "name", "pattern", "start_time"]),
  user_roles: new Set(["id", "role", "user_id"]),
};

function sanitizeRows(table: string, rows: unknown[]): Record<string, unknown>[] {
  const prot = PROTECTED_FIELDS[table] ?? new Set<string>();
  const writable = WRITABLE_COLUMNS[table];
  if (!writable) return [];
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const src = r as Record<string, unknown>;
    if (typeof src.id !== "string" || !UUID_RE.test(src.id)) continue;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!COLUMN_RE.test(k) || !writable.has(k) || prot.has(k)) continue;
      clean[k] = v;
    }
    out.push(clean);
  }
  return out;
}

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

  const inline = snapshotId === null;
  for (const table of valid) {
    if (inline && SNAPSHOT_ONLY_TABLES.has(table)) {
      errors.push(`${table}: can only be restored from a stored snapshot`);
      continue;
    }
    const rawRows = payload[table];
    const rows = Array.isArray(rawRows) ? sanitizeRows(table, rawRows) : rawRows;
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
