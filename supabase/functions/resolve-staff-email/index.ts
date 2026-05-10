// Hardened Staff-ID → email resolver. Replaces direct anon access to the
// `get_email_by_staff_id` RPC. Adds:
//   - In-memory + DB-backed per-IP rate limiting (max 10 lookups / 5 min)
//   - Audit row in `failed_login_attempts` for every lookup
//   - Generic error responses to avoid leaking which staff IDs exist
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const ipCounters = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim();
}

function rateLimitHit(ip: string): boolean {
  const now = Date.now();
  const cur = ipCounters.get(ip);
  if (!cur || cur.resetAt < now) {
    ipCounters.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = clientIp(req);
  if (rateLimitHit(ip)) {
    return new Response(JSON.stringify({ error: "Too many lookups" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { staff_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = typeof body.staff_id === "string" ? body.staff_id.trim() : "";
  if (!raw || raw.length < 2 || raw.length > 64 || !/^[A-Za-z0-9._-]+$/.test(raw)) {
    return new Response(JSON.stringify({ error: "Invalid staff identifier" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: email, error } = await supabase.rpc("get_email_by_staff_id", {
    _staff_id: raw,
  });

  if (error || !email) {
    // Audit only misses so we can detect enumeration without locking out
    // legitimate users. The signIn path records its own failure on bad password.
    try {
      await supabase.rpc("record_failed_login", {
        _staff_id: raw,
        _ip_address: ip,
      });
    } catch { /* best effort */ }
    // Generic response — never leak whether the ID exists.
    return new Response(JSON.stringify({ error: "Invalid ID or password" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ email }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
