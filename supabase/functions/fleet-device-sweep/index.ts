/**
 * FLEET DEVICE SWEEP — scheduled health check for the tracking service.
 *
 * Flags trackers that have stopped reporting (`device_offline` alerts) so a
 * silent tracker cannot hide a vehicle. Runs with the service role: it is
 * invoked by the scheduler, not by users, and performs no user-scoped reads.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";

const BodySchema = z.object({
  minutes: z.number().int().min(5).max(1440).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse(corsHeaders);


  try {
    const parsed = BodySchema.safeParse(
      req.method === "POST" ? await req.json().catch(() => ({})) : {},
    );
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("fleet_flag_offline_devices", {
      _minutes: parsed.data.minutes ?? 30,
    });
    if (error) return json({ error: "Sweep failed" }, 500);

    return json({ raised: data ?? 0 });
  } catch (_error) {
    return json({ error: "Sweep failed" }, 500);
  }
});
