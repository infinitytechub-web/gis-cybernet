import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must have admin role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const profileId: string | undefined = body.profile_id;
    const reason: string = String(body.reason ?? "").trim();

    if (!profileId || typeof profileId !== "string") {
      return new Response(JSON.stringify({ error: "profile_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reason.length < 4) {
      return new Response(JSON.stringify({ error: "A reason of at least 4 characters is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup profile
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, user_id, staff_id, first_name, last_name, rank_id, department_id")
      .eq("id", profileId)
      .single();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Self-delete protection
    if (profile.user_id && profile.user_id === user.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reserved system accounts protection
    const reserved = new Set(["ADMIN-001", "DEPUTY-001"]);
    if (profile.staff_id && reserved.has(profile.staff_id)) {
      return new Response(JSON.stringify({ error: `${profile.staff_id} is a protected system account and cannot be deleted` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit BEFORE delete (so we have the entity_id)
    await admin.from("system_audit_log").insert({
      action: "deleted_staff_account",
      entity_type: "staff_account",
      entity_id: profile.id,
      performed_by: user.id,
      details: {
        staff_id: profile.staff_id,
        name: `${profile.last_name ?? ""} ${profile.first_name ?? ""}`.trim(),
        previous: {
          rank_id: profile.rank_id,
          department_id: profile.department_id,
          user_id: profile.user_id,
        },
        reason,
        deleted_at: new Date().toISOString(),
      },
    });

    // Delete the profile (RLS bypassed by service key); related rows should cascade or be set null per FK config
    const { error: delProfErr } = await admin.from("profiles").delete().eq("id", profile.id);
    if (delProfErr) {
      return new Response(JSON.stringify({ error: `Failed to delete profile: ${delProfErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete the auth user if linked
    if (profile.user_id) {
      const { error: delUserErr } = await admin.auth.admin.deleteUser(profile.user_id);
      if (delUserErr) {
        // Profile is already gone; surface a partial-success warning
        return new Response(
          JSON.stringify({
            ok: true,
            warning: `Profile deleted but auth user removal failed: ${delUserErr.message}`,
            staff_id: profile.staff_id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        staff_id: profile.staff_id,
        name: `${profile.last_name ?? ""} ${profile.first_name ?? ""}`.trim(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
