// Shared guard for scheduled / internal edge functions.
// Allows callers that present the Supabase service-role key as a Bearer token
// (this is what pg_cron self-invocations and other internal callers use).
// Optionally also accepts an X-Cron-Secret header matching CRON_SECRET if set.
export function isInternalCaller(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (serviceRoleKey && auth.includes(serviceRoleKey)) return true;
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true;
  return false;
}

export function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
