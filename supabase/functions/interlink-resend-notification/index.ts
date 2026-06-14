// Resend a previously failed Interlink workflow notification.
// Auth: requires a logged-in command-tier user (admin/oic). RLS on
// interlink_notification_log enforces who may UPDATE the row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

interface Body {
  log_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // user-scoped client (validates JWT, applies RLS)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.log_id) return json({ error: "log_id required" }, 400);

    // Service client to read the original row (avoids dependency on SELECT RLS edge cases for rich joins)
    const admin = createClient(supabaseUrl, serviceKey);

    // Permission check via DB function — returns true only for admin/oic.
    const { data: perm } = await admin.rpc("can_export_interlink_logs", {
      _user_id: userData.user.id,
    });
    if (!perm) {
      return json({ error: "Only Admin or OIC can resend notifications" }, 403);
    }

    const { data: row, error: rowErr } = await admin
      .from("interlink_notification_log")
      .select("*, interlink_dispatches(subject)")
      .eq("id", body.log_id)
      .maybeSingle();
    if (rowErr || !row) return json({ error: "Log row not found" }, 404);

    if (!row.target_email) {
      return json({ error: "No target email on file for this notification" }, 400);
    }

    const subject =
      row.event === "approval_requested"
        ? "Interlink — Approval requested"
        : "Interlink — Review requested";
    const message = `Resent notification: dispatch "${
      row.interlink_dispatches?.subject ?? row.dispatch_id
    }" requires your attention.`;

    let newStatus: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-record-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          to: row.target_email,
          subject,
          message,
          recordType: "interlink_workflow",
          recordId: row.dispatch_id,
        }),
      });
      if (!resp.ok) {
        newStatus = "failed";
        errorMessage = `send-record-email returned ${resp.status}`;
      }
    } catch (e) {
      newStatus = "failed";
      errorMessage = (e as Error).message;
    }

    const { error: updErr } = await admin
      .from("interlink_notification_log")
      .update({
        status: newStatus,
        error_message: errorMessage,
        attempt_count: (row.attempt_count ?? 1) + 1,
        last_attempt_at: new Date().toISOString(),
        resent_by: userData.user.id,
        resent_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updErr) {
      console.error("interlink-resend-notification update error:", updErr.message);
      return json({ error: "Failed to update notification log" }, 500);
    }

    return json({ ok: true, status: newStatus, error: errorMessage });
  } catch (e) {
    console.error("interlink-resend-notification error:", (e as Error).message);
    return json({ error: "An internal error occurred" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
