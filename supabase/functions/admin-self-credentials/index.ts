// Admin self-service credential update.
//
// System administrators may update their OWN email address and/or password
// without holding a verified 2FA (AAL2) session. Supabase's user-scoped
// `updateUser` refuses email/password changes on an AAL1 session once a factor
// is enrolled; this function applies the change through the Auth Admin API
// instead, which bypasses the AAL2 requirement.
//
// Guards: valid session, `admin` role only, self-target only, CSRF-safe origin,
// full audit trail. Never logs or returns the new password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cybernet-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Only the `admin` role may bypass AAL2 for credential changes.
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return json({ error: "Forbidden: administrator role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    if (!email && !password) return json({ error: "Nothing to update" }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }
    if (password && password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const attrs: Record<string, unknown> = {};
    if (email) {
      attrs.email = email;
      attrs.email_confirm = true; // administrator-initiated change on own account
    }
    if (password) attrs.password = password;
    // Clear any forced-change flag once the admin sets their own password.
    if (password) {
      attrs.user_metadata = { ...(user.user_metadata ?? {}), must_change_password: false };
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, attrs);
    if (updErr) {
      console.error("admin-self-credentials update failed:", updErr.message);
      return json({ error: "Failed to update credentials" }, 400);
    }

    if (email) {
      await admin.from("profiles").update({ email }).eq("user_id", user.id);
    }

    await admin.from("system_audit_log").insert({
      action: password && email ? "admin_self_email_and_password_update" : password ? "admin_self_password_update" : "admin_self_email_update",
      entity_type: "auth.users",
      entity_id: user.id,
      performed_by: user.id,
      details: {
        changed_email: !!email,
        changed_password: !!password,
        new_email: email ?? null,
        aal2_bypass: true,
        at: new Date().toISOString(),
      },
    });

    return json({ success: true, changed_email: !!email, changed_password: !!password });
  } catch (err) {
    console.error("admin-self-credentials error:", (err as Error)?.message ?? String(err));
    return json({ error: "An internal error occurred" }, 500);
  }
});
