// One-off: reset all admin accounts — unlock + generate a fresh temporary
// password for each. Force must_change_password on next login.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { generateSecurePassword } from "../_shared/csprng-password.ts";

Deno.serve(async (_req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const { data: roles, error: rErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rErr) throw rErr;

    const results: any[] = [];
    for (const row of roles ?? []) {
      const { data: prof } = await admin
        .from("profiles")
        .select("id, staff_id, first_name, last_name, email")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const newPassword = generateSecurePassword(12);
      const { error: upErr } = await admin.auth.admin.updateUserById(row.user_id, {
        password: newPassword,
        user_metadata: { must_change_password: true },
      });

      if (prof) {
        await admin
          .from("profiles")
          .update({ account_locked: false, login_enabled: true, failed_login_attempts: 0 })
          .eq("user_id", row.user_id);
        if (prof.staff_id) {
          try { await admin.rpc("admin_reset_failed_attempts", { _staff_id: prof.staff_id }); } catch {}
        }
      }

      results.push({
        staff_id: prof?.staff_id ?? null,
        name: prof ? `${prof.first_name} ${prof.last_name}` : null,
        email: prof?.email ?? null,
        temporary_password: newPassword,
        ok: !upErr,
        error: upErr?.message ?? null,
      });
    }

    return new Response(
      JSON.stringify({ must_change_password: true, accounts: results }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
