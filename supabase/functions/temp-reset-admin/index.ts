// One-shot admin password reset for GIS-ASC-0007. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const userId = "95b4521f-f0fc-43fe-8658-38d8201ba41e";
  const newPassword = "AdminLogin#2026!Easy";

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
    user_metadata: { must_change_password: false },
  });
  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), { status: 500 });
  }

  // Clear lockout
  await admin.from("profiles").update({ account_locked: false }).eq("user_id", userId);
  await admin.rpc("admin_reset_failed_attempts", { _staff_id: "GIS-ASC-0007" }).catch(() => {});

  return new Response(JSON.stringify({ ok: true, password: newPassword }), {
    headers: { "Content-Type": "application/json" },
  });
});
