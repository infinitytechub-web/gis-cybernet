import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generatePassword(length = 12): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

function makeUsername(
  firstName: string,
  lastName: string,
  existingUsernames: Set<string>
): string {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller is admin (skip if no auth header — internal/tool invocation)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
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
    }

    console.log("Step 1: Getting all active profiles with linked accounts...");

    // Get profiles that have user_id linked (excluding admin)
    const { data: linkedProfiles, error: lpErr } = await adminClient
      .from("profiles")
      .select("id, user_id, staff_id")
      .not("user_id", "is", null)
      .eq("status", "active");

    if (lpErr) throw lpErr;

    // Find admin user IDs to preserve (by role, not staff_id)
    const adminUserIds = new Set<string>();
    if (linkedProfiles) {
      const userIds = linkedProfiles.filter(p => p.user_id).map(p => p.user_id!);
      if (userIds.length > 0) {
        const { data: adminRoles } = await adminClient
          .from("user_roles")
          .select("user_id")
          .in("user_id", userIds)
          .eq("role", "admin");
        if (adminRoles) {
          for (const r of adminRoles) {
            adminUserIds.add(r.user_id);
          }
        }
      }
    }

    const profilesToReset = (linkedProfiles ?? []).filter(
      (p) => !adminUserIds.has(p.user_id!)
    );

    console.log(`Step 2: Unlinking ${profilesToReset.length} profiles and deleting auth users...`);

    // Unlink profiles and delete auth users
    let unlinkErrors: string[] = [];
    for (const profile of profilesToReset) {
      try {
        // Unlink profile
        await adminClient
          .from("profiles")
          .update({ user_id: null })
          .eq("id", profile.id);

        // Delete user roles
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", profile.user_id!);

        // Delete auth user
        await adminClient.auth.admin.deleteUser(profile.user_id!);
      } catch (e) {
        unlinkErrors.push(`${profile.staff_id}: ${e.message}`);
      }
    }

    console.log(`Step 3: Creating fresh accounts for all active staff...`);

    // Now get all active profiles without user_id
    const { data: profiles, error: pErr } = await adminClient
      .from("profiles")
      .select("id, first_name, last_name, staff_id")
      .is("user_id", null)
      .eq("status", "active");

    if (pErr) throw pErr;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({
          created: [],
          errors: unlinkErrors.map((e) => ({ staffId: "reset", error: e })),
          total: 0,
          unlinked: profilesToReset.length,
          message: "No profiles to create accounts for",
        }),
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

    const created: Array<{ staffId: string; name: string; username: string; password: string }> = [];
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        const username = makeUsername(profile.first_name, profile.last_name, existingUsernames);
        const email = `${username}@gis.local`;
        const password = generatePassword(12);

        const { data: newUser, error: createErr } =
          await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              first_name: profile.first_name,
              last_name: profile.last_name,
              staff_id: `__tmp_${profile.staff_id}`,
              must_change_password: true,
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
          .from("profiles")
          .update({ user_id: newUser.user.id })
          .eq("id", profile.id);

        if (updateErr) {
          errors.push({ staffId: profile.staff_id, error: updateErr.message });
          continue;
        }

        // Assign default 'staff' role
        await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "staff" });

        created.push({
          staffId: profile.staff_id,
          name: `${profile.first_name} ${profile.last_name}`,
          username,
          password,
        });
      } catch (e) {
        errors.push({ staffId: profile.staff_id, error: e.message || "Unknown error" });
      }
    }

    console.log(`Done: ${created.length} created, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ created, errors, total: profiles.length, unlinked: profilesToReset.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Fatal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
