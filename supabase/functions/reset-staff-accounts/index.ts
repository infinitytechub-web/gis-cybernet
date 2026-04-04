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

    // Get all active profiles with user_id that are NOT the current admin
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

    let deleted = 0;
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        const userId = profile.user_id;

        // Delete user_roles
        await adminClient.from("user_roles").delete().eq("user_id", userId);

        // Clear user_id on the profile (trigger now allows NULL)
        const { error: updateErr } = await adminClient
          .from("profiles")
          .update({ user_id: null })
          .eq("id", profile.id);

        if (updateErr) {
          errors.push({ staffId: profile.staff_id, error: `Unlink: ${updateErr.message}` });
          continue;
        }

        // Delete the auth user
        const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
        if (delErr) {
          errors.push({ staffId: profile.staff_id, error: `Auth delete: ${delErr.message}` });
          continue;
        }

        deleted++;
      } catch (e) {
        errors.push({ staffId: profile.staff_id, error: e.message || "Unknown error" });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Reset complete. ${deleted} accounts deleted and unlinked.`,
        deleted,
        total: profiles.length,
        errors,
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
