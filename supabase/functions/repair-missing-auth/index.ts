// Repairs profiles where login_enabled = true but user_id IS NULL.
// For each such profile:
//   1. Try to find an existing auth user by candidate email (first.last@gis.local, .1, .2, ...)
//      that is not yet linked to any profile, and link it. (No password change.)
//   2. Otherwise create a new auth user with a generated password and link it.
//   3. Ensure a 'staff' role row exists.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateSecurePassword } from "../_shared/csprng-password.ts";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";
import { hasStaffAdminAuthority, STAFF_ADMIN_DENIED } from "../_shared/staff-admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

function slug(s: string) {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, srk);

    // Admin gate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await hasStaffAdminAuthority(admin, user.id))) {
      return new Response(JSON.stringify({ error: STAFF_ADMIN_DENIED }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all auth users and index by email (lowercase) → id
    const allAuth: { id: string; email: string }[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      if (!data?.users?.length) break;
      for (const u of data.users) if (u.email) allAuth.push({ id: u.id, email: u.email.toLowerCase() });
      if (data.users.length < 1000) break;
      page++;
    }
    const authByEmail = new Map(allAuth.map(u => [u.email, u.id]));

    // Auth user IDs already linked to any profile → can't reuse them
    const { data: linked } = await admin.from("profiles").select("user_id").not("user_id", "is", null);
    const linkedIds = new Set((linked ?? []).map((r: any) => r.user_id));

    // Profiles needing repair
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, first_name, last_name, staff_id")
      .is("user_id", null)
      .eq("login_enabled", true);
    if (pErr) throw pErr;

    const created: Array<{ staffId: string; name: string; username: string; password: string; action: "linked" | "created" }> = [];
    const errors: Array<{ staffId: string; error: string }> = [];

    for (const p of (profiles ?? [])) {
      try {
        const base = `${slug(p.first_name)}.${slug(p.last_name)}`;
        if (!base || base === ".") {
          errors.push({ staffId: p.staff_id, error: "Cannot derive username from name" });
          continue;
        }

        // Try to reuse an existing unlinked auth user matching base / base1 / base2 ...
        let linkedAuthId: string | null = null;
        let chosenUsername = base;
        for (let n = 0; n < 25; n++) {
          const candidate = n === 0 ? base : `${base}${n}`;
          const email = `${candidate}@gis.local`;
          const id = authByEmail.get(email);
          if (id && !linkedIds.has(id)) {
            linkedAuthId = id;
            chosenUsername = candidate;
            break;
          }
          if (!id) {
            chosenUsername = candidate;
            break;
          }
        }

        if (linkedAuthId) {
          // Link existing auth user
          const { error: upErr } = await admin
            .from("profiles").update({ user_id: linkedAuthId }).eq("id", p.id);
          if (upErr) { errors.push({ staffId: p.staff_id, error: upErr.message }); continue; }
          linkedIds.add(linkedAuthId);
          // Ensure staff role
          await admin.from("user_roles").upsert(
            { user_id: linkedAuthId, role: "staff" },
            { onConflict: "user_id,role" } as any,
          );
          created.push({
            staffId: p.staff_id,
            name: `${p.first_name} ${p.last_name}`,
            username: chosenUsername,
            password: "(unchanged — existing account linked)",
            action: "linked",
          });
        } else {
          // Create a new auth user
          const email = `${chosenUsername}@gis.local`;
          const password = generateSecurePassword(12);
          const { data: nu, error: cErr } = await admin.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: {
              first_name: p.first_name, last_name: p.last_name,
              staff_id: `__tmp_${p.staff_id}`, must_change_password: true,
            },
          });
          if (cErr || !nu?.user) {
            errors.push({ staffId: p.staff_id, error: cErr?.message || "createUser failed" });
            continue;
          }
          // Trigger may have inserted a profile/role for this new user — clean those before linking
          await admin.from("profiles").delete().eq("user_id", nu.user.id);
          await admin.from("user_roles").delete().eq("user_id", nu.user.id);
          const { error: upErr } = await admin
            .from("profiles").update({ user_id: nu.user.id }).eq("id", p.id);
          if (upErr) { errors.push({ staffId: p.staff_id, error: upErr.message }); continue; }
          await admin.from("user_roles").insert({ user_id: nu.user.id, role: "staff" });
          authByEmail.set(email.toLowerCase(), nu.user.id);
          linkedIds.add(nu.user.id);
          created.push({
            staffId: p.staff_id,
            name: `${p.first_name} ${p.last_name}`,
            username: chosenUsername,
            password,
            action: "created",
          });
        }
      } catch (e: any) {
        errors.push({ staffId: p.staff_id, error: e?.message ?? String(e) });
      }
    }

    // Audit trail — counts and context only, never password values.
    await admin.from("system_audit_log").insert({
      action: "bulk_credentials_repaired",
      entity_type: "staff_credentials",
      entity_id: null,
      performed_by: user.id,
      details: {
        source: "repair_missing_auth",
        accounts_created: created.filter((c) => c.action === "created").length,
        accounts_linked: created.filter((c) => c.action === "linked").length,
        failures: errors.length,
        total_considered: (profiles ?? []).length,
        repaired_at: new Date().toISOString(),
      },
    });


    return new Response(
      JSON.stringify({ created, errors, total: (profiles ?? []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("repair-missing-auth error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
