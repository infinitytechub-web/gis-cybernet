import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all profiles with user_id that are NOT the current admin
    const { data: profiles, error: pErr } = await adminClient
      .from("profiles")
      .select("id, staff_id, user_id")
      .not("user_id", "is", null)
      .neq("user_id", user.id)
      .eq("status", "active");

    if (pErr) throw pErr;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No staff accounts to reset", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let unlinked = 0;
    let deleted = 0;
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        const userId = profile.user_id;

        // Delete user_roles for this user
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", userId);

        // We need to temporarily disable the prevent_user_id_change trigger
        // by using the service role to directly update via SQL
        // Actually the trigger allows NULL -> value, but not value -> different value
        // We need to set user_id to NULL, which the trigger blocks.
        // So we'll delete the auth user first (which won't cascade to profiles),
        // then use a raw SQL approach.

        // Delete the auth user
        const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
        if (delErr) {
          errors.push({ staffId: profile.staff_id, error: `Auth delete: ${delErr.message}` });
          continue;
        }
        deleted++;

        // Now set user_id to NULL on the profile using RPC
        // Since the trigger blocks this, we'll use the service role client
        // The trigger runs as SECURITY DEFINER but still blocks the change.
        // We need to handle this differently - update via direct SQL
        unlinked++;
      } catch (e) {
        errors.push({ staffId: profile.staff_id, error: e.message || "Unknown error" });
      }
    }

    // Now we need to set user_id = NULL on all these profiles
    // The prevent_user_id_change trigger blocks this, so we temporarily drop it
    // Actually, let's just call a database function
    
    return new Response(
      JSON.stringify({
        message: `Deleted ${deleted} auth users. Profiles need user_id cleared via migration.`,
        deleted,
        errors,
        profileIds: profiles.map(p => p.id),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
