// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// Scheduled / manual cleanup of expired announcement files.
// Uses service role to apply default retention to legacy rows and to deactivate
// or soft-delete any file whose expires_at has passed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInternalCaller } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Reject unauthenticated callers. Only accept either a user Bearer JWT
  // (validated below as admin) or an internal/cron caller (service-role).
  const authHeader = req.headers.get("Authorization");
  const hasUserBearer = !!authHeader && authHeader.startsWith("Bearer ");
  if (!hasUserBearer && !isInternalCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const startedAt = new Date().toISOString();
  let triggerKind = "scheduled";
  let triggeredBy: string | null = null;

  // If invoked with a user JWT, capture identity + ensure they're admin.
  // Pure service-role/cron callers (no user JWT) are accepted as scheduled.
  if (hasUserBearer) {
    let userIdentified = false;
    try {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader! } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userIdentified = true;
        triggerKind = "manual";
        triggeredBy = user.id;
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const isAdmin = (roles ?? []).some((r) => r.role === "admin");
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Admin only" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch {
      /* invalid token */
    }
    // If a Bearer token was supplied but isn't a valid user AND isn't an
    // internal caller, reject — don't silently fall through as "scheduled".
    if (!userIdentified && !isInternalCaller(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings || settings.announcement_file_retention_enabled === false) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Retention disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const globalDays = settings.announcement_file_retention_days_global ?? 365;
    const deptDays = settings.announcement_file_retention_days_department ?? 180;
    const mode = settings.announcement_file_cleanup_mode ?? "deactivate";

    // 1. Apply default retention to active files missing expires_at
    const { data: legacy } = await supabase
      .from("announcement_files")
      .select("id, department_id, created_at")
      .eq("is_active", true)
      .is("expires_at", null);

    let defaultApplied = 0;
    for (const row of legacy ?? []) {
      const days = row.department_id ? deptDays : globalDays;
      const expires = new Date(new Date(row.created_at).getTime() + days * 86400_000);
      const { error } = await supabase
        .from("announcement_files")
        .update({ expires_at: expires.toISOString(), retention_days: days })
        .eq("id", row.id);
      if (!error) defaultApplied++;
    }

    // 2. Find expired active files
    const { data: expired } = await supabase
      .from("announcement_files")
      .select("id")
      .eq("is_active", true)
      .lte("expires_at", new Date().toISOString());

    let deactivated = 0;
    let softDeleted = 0;
    const ids = (expired ?? []).map((r) => r.id);
    if (ids.length) {
      const patch: Record<string, unknown> = {
        is_active: false,
        expired_at: new Date().toISOString(),
      };
      if (mode === "soft_delete") {
        patch.deleted_at = new Date().toISOString();
        if (triggeredBy) patch.deleted_by = triggeredBy;
      }
      const { error } = await supabase
        .from("announcement_files")
        .update(patch)
        .in("id", ids);
      if (!error) {
        if (mode === "soft_delete") softDeleted = ids.length;
        else deactivated = ids.length;
      }
    }

    const { data: scanned } = await supabase
      .from("announcement_files")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    await supabase.from("announcement_file_cleanup_runs").insert({
      triggered_by: triggeredBy,
      trigger_kind: triggerKind,
      files_scanned: (scanned as any)?.length ?? 0,
      files_deactivated: deactivated,
      files_soft_deleted: softDeleted,
      files_with_default_applied: defaultApplied,
      status: "completed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    await supabase
      .from("app_settings")
      .update({ announcement_file_cleanup_last_run_at: new Date().toISOString() })
      .eq("id", settings.id);

    return new Response(
      JSON.stringify({
        ok: true,
        defaultApplied,
        deactivated,
        softDeleted,
        mode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("announcement_file_cleanup_runs").insert({
      triggered_by: triggeredBy,
      trigger_kind: triggerKind,
      status: "failed",
      error_message: msg,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
