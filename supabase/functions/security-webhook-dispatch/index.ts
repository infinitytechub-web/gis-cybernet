// csrf-classification: cron: protected by isInternalCaller / x-cron-secret
// supabase/functions/security-webhook-dispatch/index.ts
// Drains the security-alert webhook delivery queue: signs each payload with the
// destination's HMAC secret, retries failures with exponential backoff and
// dead-letters deliveries that exhaust their attempt budget.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { isInternalCaller, unauthorizedResponse } from "../_shared/cron-auth.ts";
import { drainDeliveryQueue } from "../_shared/security-webhook-delivery.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!isInternalCaller(req)) return unauthorizedResponse();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Bounded batch per run; claiming is single-flight in the database.
    const result = await drainDeliveryQueue(supabase, 20);
    return json({ ok: true, ...result });
  } catch {
    return json({ error: "Unexpected error draining webhook queue" }, 500);
  }
});
