// One-off: reset password for a specific admin profile. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);
  const body = await req.json().catch(() => ({}));
  const userId = body.user_id as string;
  const password = body.password as string;
  const mustChange = body.must_change_password !== false;

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { must_change_password: mustChange },
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  await admin.from("profiles").update({ account_locked: false }).eq("user_id", userId);
  try { await admin.rpc("clear_failed_login_attempts", { _staff_id: body.staff_id }); } catch {}

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
