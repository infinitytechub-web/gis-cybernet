import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = "test.user@gis.local";
  const password = "Test@GIS2026";
  const staffId = "TEST-001";

  const { data: { users } } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const existing = users?.find((u) => u.email === email);

  if (existing) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 400 });

    // Ensure deputy role (deputized admin)
    await supabase.from("user_roles").delete().eq("user_id", existing.id);
    await supabase.from("user_roles").insert({ user_id: existing.id, role: "deputy" });

    return new Response(JSON.stringify({
      message: "Test user password reset",
      staffId,
      email,
      password,
      role: "deputy (deputized admin)",
    }));
  }

  // Create new user
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { staff_id: staffId, first_name: "Test", last_name: "User" },
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  // Set deputy role (deputized admin privileges)
  await supabase.from("user_roles").upsert({ user_id: newUser.user!.id, role: "deputy" });

  return new Response(JSON.stringify({
    message: "Test user created",
    staffId,
    email,
    password,
    role: "deputy (deputized admin)",
  }));
});
