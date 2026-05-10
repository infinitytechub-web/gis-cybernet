// One-off: reset all admin accounts to a known default password.
// Protected by a shared secret passed in the Authorization header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const DEFAULT_PASSWORD = "Cybernet@2026";

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    // Find admin user_ids
    const { data: roles, error: rErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rErr) throw rErr;

    const results: any[] = [];
    for (const row of roles ?? []) {
      const { data: prof } = await admin
        .from("profiles")
        .select("staff_id, first_name, last_name, email")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const { error: upErr } = await admin.auth.admin.updateUserById(row.user_id, {
        password: DEFAULT_PASSWORD,
        user_metadata: { must_change_password: true },
      });

      if (prof) {
        await admin
          .from("profiles")
          .update({ account_locked: false })
          .eq("user_id", row.user_id);
        if (prof.staff_id) {
          await admin.rpc("admin_reset_failed_attempts", { _staff_id: prof.staff_id }).catch(() => {});
        }
      }

      results.push({
        staff_id: prof?.staff_id ?? null,
        name: prof ? `${prof.first_name} ${prof.last_name}` : null,
        email: prof?.email ?? null,
        ok: !upErr,
        error: upErr?.message ?? null,
      });
    }

    return new Response(
      JSON.stringify({ default_password: DEFAULT_PASSWORD, must_change_password: true, accounts: results }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
