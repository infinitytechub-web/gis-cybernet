import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { generateSecurePassword } from "../_shared/csprng-password.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function generatePassword(length = 12): string {
  return generateSecurePassword(length);
}

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

    // Verify the caller is an admin
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
    if (!profileId || typeof profileId !== "string") {
      return new Response(JSON.stringify({ error: "profile_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the profile
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, user_id, staff_id, first_name, last_name, email")
      .eq("id", profileId)
      .single();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!profile.user_id) {
      return new Response(JSON.stringify({ error: "Profile has no linked auth account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate new password
    const newPassword = generatePassword(12);

    // Update password and set must_change_password flag
    const { error: updErr } = await admin.auth.admin.updateUserById(profile.user_id, {
      password: newPassword,
      user_metadata: { must_change_password: true },
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear any failed login attempts and account_locked
    await admin.rpc("admin_reset_failed_attempts", { _staff_id: profile.staff_id }).then(() => {}).catch(() => {});
    await admin.from("profiles").update({ account_locked: false }).eq("id", profile.id);

    // Audit log
    await admin.from("system_audit_log").insert({
      action: "password_reset",
      entity_type: "profiles",
      entity_id: profile.id,
      performed_by: user.id,
      details: {
        target_staff_id: profile.staff_id,
        target_name: `${profile.first_name} ${profile.last_name}`,
        reset_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        staff_id: profile.staff_id,
        full_name: `${profile.first_name} ${profile.last_name}`,
        email: profile.email,
        temporary_password: newPassword,
        must_change_password: true,
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
