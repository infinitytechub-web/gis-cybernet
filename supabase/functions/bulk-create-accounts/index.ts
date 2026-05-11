import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateSecurePassword } from "../_shared/csprng-password.ts";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

function generatePassword(length = 12): string {
  return generateSecurePassword(length);
}

function makeUsername(firstName: string, lastName: string, existingUsernames: Set<string>): string {
  const base = `${firstName.trim().toLowerCase().replace(/\s+/g, "")}.${lastName.trim().toLowerCase().replace(/\s+/g, "")}`;
  let username = base;
  let counter = 1;
  while (existingUsernames.has(username)) {
    username = `${base}${counter}`;
    counter++;
  }
  existingUsernames.add(username);
  return username;
}

async function cleanupOrphanAuthUsers(adminClient: any) {
  // Get all auth users in pages
  const allAuthUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data?.users?.length) break;
    allAuthUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }

  // Get all profile user_ids
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("user_id")
    .not("user_id", "is", null);
  const linkedUserIds = new Set((profiles ?? []).map((p: any) => p.user_id));

  // Delete orphan auth users (no linked profile)
  let deleted = 0;
  for (const user of allAuthUsers) {
    if (!linkedUserIds.has(user.id)) {
      try {
        // Clean up any orphan roles first
        await adminClient.from("user_roles").delete().eq("user_id", user.id);
        await adminClient.from("profiles").delete().eq("user_id", user.id);
        await adminClient.auth.admin.deleteUser(user.id);
        deleted++;
      } catch (_) { /* ignore */ }
    }
  }
  console.log(`Cleaned up ${deleted} orphan auth users`);
  return deleted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller is admin (auth header is REQUIRED)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await adminClient
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 1: Clean up orphan auth users from previous failed attempts
    console.log("Step 1: Cleaning up orphan auth users...");
    await cleanupOrphanAuthUsers(adminClient);

    // Step 2: Get all active profiles without user_id
    console.log("Step 2: Getting active profiles without accounts...");
    const { data: profiles, error: pErr } = await adminClient
      .from("profiles")
      .select("id, first_name, last_name, staff_id")
      .is("user_id", null)
      .eq("status", "active");

    if (pErr) throw pErr;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ created: [], errors: [], total: 0, message: "All active staff already have accounts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect existing usernames
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUsernames = new Set<string>();
    if (existingUsers?.users) {
      for (const u of existingUsers.users) {
        if (u.email) existingUsernames.add(u.email.split("@")[0]);
      }
    }

    console.log(`Step 3: Creating accounts for ${profiles.length} staff...`);
    const created: Array<{ staffId: string; name: string; username: string; password: string }> = [];
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        const username = makeUsername(profile.first_name, profile.last_name, existingUsernames);
        const email = `${username}@gis.local`;
        const password = generatePassword(12);

        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: {
            first_name: profile.first_name, last_name: profile.last_name,
            staff_id: `__tmp_${profile.staff_id}`, must_change_password: true,
          },
        });

        if (createErr) {
          errors.push({ staffId: profile.staff_id, error: createErr.message });
          continue;
        }

        // Delete auto-created profile and role from trigger
        await adminClient.from("profiles").delete().eq("user_id", newUser.user.id);
        await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);

        // Link existing profile
        const { error: updateErr } = await adminClient
          .from("profiles").update({ user_id: newUser.user.id }).eq("id", profile.id);
        if (updateErr) {
          errors.push({ staffId: profile.staff_id, error: updateErr.message });
          continue;
        }

        // Assign default 'staff' role
        await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "staff" });

        created.push({
          staffId: profile.staff_id,
          name: `${profile.first_name} ${profile.last_name}`,
          username, password,
        });
      } catch (e) {
        errors.push({ staffId: profile.staff_id, error: e.message || "Unknown error" });
      }
    }

    console.log(`Done: ${created.length} created, ${errors.length} errors`);
    return new Response(
      JSON.stringify({ created, errors, total: profiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Fatal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
