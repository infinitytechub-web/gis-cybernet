import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = "admin@gis.local";
  const password = "Admin@ASC2026";

  // Try to find existing user by email (more reliable than listUsers)
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const existing = users?.find((u) => u.email === email);

  if (existing) {
    // Update password
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 400 });

    // Ensure admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", existing.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      await supabase.from("user_roles").upsert({
        user_id: existing.id,
        role: "admin",
      });
    }
    return new Response(JSON.stringify({ message: "Admin password reset", email, password }));
  }

  // Create new user
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { staff_id: "ADMIN-001", first_name: "System", last_name: "Admin" },
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  // Set admin role
  await supabase
    .from("user_roles")
    .upsert({ user_id: newUser.user!.id, role: "admin" });

  return new Response(JSON.stringify({ message: "Admin created", email, password }));
});
