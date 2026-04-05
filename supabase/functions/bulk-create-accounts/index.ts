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

    // Check authorization: service role key in apikey header OR valid admin JWT
    const apikeyHeader = req.headers.get("apikey") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey || apikeyHeader === serviceRoleKey;
    
    console.log("Auth debug:", { hasApikey: !!apikeyHeader, hasAuth: !!authHeader, isServiceRole, apikeyLen: apikeyHeader.length, tokenLen: token.length, srkLen: serviceRoleKey.length });

    if (!isServiceRole) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient2 = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminClient2
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get all active profiles without user_id
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
          errors: [],
          total: 0,
          message: "All active staff already have accounts",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect existing usernames (email local parts) to avoid collisions
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });
    const existingUsernames = new Set<string>();
    if (existingUsers?.users) {
      for (const u of existingUsers.users) {
        if (u.email) {
          existingUsernames.add(u.email.split("@")[0]);
        }
      }
    }

    const created: Array<{
      staffId: string;
      name: string;
      username: string;
      password: string;
    }> = [];
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        const username = makeUsername(
          profile.first_name,
          profile.last_name,
          existingUsernames
        );
        const email = `${username}@gis.local`;
        const password = generatePassword(12);

        // Create auth user with a placeholder staff_id to prevent the trigger
        // from creating a conflicting profile
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

        // Delete the auto-created profile from the trigger
        await adminClient
          .from("profiles")
          .delete()
          .eq("user_id", newUser.user.id);

        // Delete the auto-created user_role from the trigger
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", newUser.user.id);

        // Link existing profile to this auth user
        const { error: updateErr } = await adminClient
          .from("profiles")
          .update({ user_id: newUser.user.id })
          .eq("id", profile.id);

        if (updateErr) {
          errors.push({
            staffId: profile.staff_id,
            error: updateErr.message,
          });
          continue;
        }

        // Assign default 'staff' role
        await adminClient
          .from("user_roles")
          .insert({ user_id: newUser.user.id, role: "staff" });

        created.push({
          staffId: profile.staff_id,
          name: `${profile.first_name} ${profile.last_name}`,
          username,
          password,
        });
      } catch (e) {
        errors.push({
          staffId: profile.staff_id,
          error: e.message || "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({ created, errors, total: profiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
