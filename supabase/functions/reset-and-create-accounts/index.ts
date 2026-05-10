import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateSecurePassword } from "../_shared/csprng-password.ts";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function collectExistingUsernames(adminClient: any): Promise<Set<string>> {
  const existing = new Set<string>();
  let page = 1;
  while (true) {
    const { data } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) existing.add(u.email.split("@")[0]);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return existing;
}

// Phase 1: Unlink profiles and delete auth users (non-admin), then transition to phase 2
async function phaseReset(jobId: string, adminClient: any) {
  await adminClient.from("processing_jobs").update({ status: "processing", progress: 5 }).eq("id", jobId);

  // Get linked profiles
  const { data: linkedProfiles, error: lpErr } = await adminClient
    .from("profiles")
    .select("id, user_id, staff_id")
    .not("user_id", "is", null)
    .eq("status", "active");
  if (lpErr) throw lpErr;

  // Find admin user IDs to preserve
  const adminUserIds = new Set<string>();
  if (linkedProfiles?.length) {
    const userIds = linkedProfiles.filter((p: any) => p.user_id).map((p: any) => p.user_id!);
    if (userIds.length > 0) {
      const { data: adminRoles } = await adminClient
        .from("user_roles").select("user_id").in("user_id", userIds).eq("role", "admin");
      if (adminRoles) {
        for (const r of adminRoles) adminUserIds.add(r.user_id);
      }
    }
  }

  const profilesToReset = (linkedProfiles ?? []).filter((p: any) => !adminUserIds.has(p.user_id!));
  const unlinkErrors: string[] = [];

  for (const profile of profilesToReset) {
    try {
      await adminClient.from("profiles").update({ user_id: null }).eq("id", profile.id);
      await adminClient.from("user_roles").delete().eq("user_id", profile.user_id!);
      await adminClient.auth.admin.deleteUser(profile.user_id!);
    } catch (e: any) {
      unlinkErrors.push(`${profile.staff_id}: ${e.message}`);
    }
  }

  await adminClient.from("processing_jobs").update({ progress: 15 }).eq("id", jobId);

  // Clean up orphan auth users
  const allAuthUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data?.users?.length) break;
    allAuthUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  const { data: allProfilesWithUser } = await adminClient
    .from("profiles").select("user_id").not("user_id", "is", null);
  const stillLinked = new Set((allProfilesWithUser ?? []).map((p: any) => p.user_id));
  for (const user of allAuthUsers) {
    if (!stillLinked.has(user.id)) {
      try {
        await adminClient.from("user_roles").delete().eq("user_id", user.id);
        await adminClient.from("profiles").delete().eq("user_id", user.id);
        await adminClient.auth.admin.deleteUser(user.id);
      } catch (_) { /* ignore */ }
    }
  }

  await adminClient.from("processing_jobs").update({ progress: 20 }).eq("id", jobId);

  // Count total profiles to create
  const { count } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("user_id", null)
    .eq("status", "active");

  const totalProfiles = count ?? 0;

  // Store phase state in result and transition to batch creation
  await adminClient.from("processing_jobs").update({
    total: totalProfiles,
    progress: 20,
    result: {
      phase: "creating",
      batch_offset: 0,
      created: [],
      errors: unlinkErrors.map((e) => ({ staffId: "reset", error: e })),
      unlinked: profilesToReset.length,
    },
  }).eq("id", jobId);

  return totalProfiles;
}

// Phase 2: Create accounts in a batch of BATCH_SIZE starting at offset
async function phaseBatchCreate(jobId: string, adminClient: any) {
  const { data: job } = await adminClient.from("processing_jobs").select("result, total").eq("id", jobId).single();
  if (!job) throw new Error("Job not found");

  const state = job.result as any;
  const offset = state.batch_offset ?? 0;
  const totalProfiles = job.total ?? 0;
  const allCreated: any[] = state.created ?? [];
  const allErrors: any[] = state.errors ?? [];

  // Get the next batch of profiles without accounts
  const { data: profiles, error: pErr } = await adminClient
    .from("profiles")
    .select("id, first_name, last_name, staff_id")
    .is("user_id", null)
    .eq("status", "active")
    .order("staff_id", { ascending: true })
    .range(0, BATCH_SIZE - 1); // Always take first BATCH_SIZE unlinked profiles

  if (pErr) throw pErr;

  if (!profiles || profiles.length === 0) {
    // All done
    await adminClient.from("processing_jobs").update({
      status: "completed",
      progress: 100,
      result: { created: allCreated, errors: allErrors, total: totalProfiles, unlinked: state.unlinked ?? 0 },
    }).eq("id", jobId);
    console.log(`Batch complete. Total created: ${allCreated.length}, errors: ${allErrors.length}`);
    return false; // No more batches
  }

  const existingUsernames = await collectExistingUsernames(adminClient);
  // Also add already-created usernames from previous batches
  for (const c of allCreated) {
    if (c.username) existingUsernames.add(c.username);
  }

  const batchCreated: any[] = [];
  const batchErrors: any[] = [];

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
        batchErrors.push({ staffId: profile.staff_id, error: createErr.message });
        continue;
      }

      await adminClient.from("profiles").delete().eq("user_id", newUser.user.id);
      await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);

      const { error: updateErr } = await adminClient
        .from("profiles").update({ user_id: newUser.user.id }).eq("id", profile.id);
      if (updateErr) {
        batchErrors.push({ staffId: profile.staff_id, error: updateErr.message });
        continue;
      }

      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "staff" });

      batchCreated.push({ staffId: profile.staff_id, name: `${profile.first_name} ${profile.last_name}`, username, password });
    } catch (e: any) {
      batchErrors.push({ staffId: profile.staff_id, error: e.message || "Unknown error" });
    }
  }

  const newCreated = [...allCreated, ...batchCreated];
  const newErrors = [...allErrors, ...batchErrors];
  const processed = newCreated.length + newErrors.length - (state.errors?.filter((e: any) => e.staffId === "reset")?.length ?? 0);
  const pct = totalProfiles > 0 ? Math.min(20 + Math.round((processed / totalProfiles) * 80), 99) : 99;

  console.log(`Batch done: +${batchCreated.length} created, +${batchErrors.length} errors. Total progress: ${pct}%`);

  // Update job with accumulated results
  await adminClient.from("processing_jobs").update({
    progress: pct,
    result: {
      phase: "creating",
      batch_offset: offset + profiles.length,
      created: newCreated,
      errors: newErrors,
      unlinked: state.unlinked ?? 0,
    },
  }).eq("id", jobId);

  return true; // More batches needed
}

async function runNextBatch(jobId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const hasMore = await phaseBatchCreate(jobId, adminClient);
    if (hasMore) {
      // Self-invoke for the next batch
      const fnUrl = `${supabaseUrl}/functions/v1/reset-and-create-accounts`;
      fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ job_id: jobId, _batch: true }),
      }).catch((e) => console.error("Self-invoke failed:", e));
    }
  } catch (err: any) {
    console.error("Batch error:", err.message);
    await adminClient.from("processing_jobs").update({
      status: "failed", error: err.message,
    }).eq("id", jobId);
  }
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

    const body = await req.json().catch(() => ({}));

    // Internal batch continuation call — MUST be authenticated with service-role key
    if (body._batch && body.job_id) {
      const batchAuth = req.headers.get("Authorization") ?? "";
      if (!serviceRoleKey || !batchAuth.includes(serviceRoleKey)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      EdgeRuntime.waitUntil(runNextBatch(body.job_id));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader && !authHeader.includes(serviceRoleKey)) {
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

      // Create job record
      const { data: job, error: jobError } = await adminClient
        .from("processing_jobs")
        .insert({ task_type: "reset_and_create_accounts", status: "queued", created_by: user.id })
        .select()
        .single();
      if (jobError) throw jobError;

      // Start reset phase in background, then first batch
      EdgeRuntime.waitUntil((async () => {
        try {
          const totalProfiles = await phaseReset(job.id, adminClient);
          if (totalProfiles > 0) {
            // Kick off first batch via self-invoke
            const fnUrl = `${supabaseUrl}/functions/v1/reset-and-create-accounts`;
            await fetch(fnUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ job_id: job.id, _batch: true }),
            });
          } else {
            await adminClient.from("processing_jobs").update({
              status: "completed", progress: 100, total: 0,
              result: { created: [], errors: [], unlinked: 0, message: "No profiles to create accounts for" },
            }).eq("id", job.id);
          }
        } catch (err: any) {
          console.error("Reset phase error:", err.message);
          await adminClient.from("processing_jobs").update({
            status: "failed", error: err.message,
          }).eq("id", job.id);
        }
      })());

      return new Response(
        JSON.stringify({ job_id: job.id, status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Authorization required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Fatal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
