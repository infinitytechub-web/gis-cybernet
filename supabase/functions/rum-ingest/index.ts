// RUM event ingestion. Accepts a JSON batch of telemetry events and inserts
// them into public.rum_events via the service role. No JWT required —
// telemetry is sent from unauthenticated (login) and authenticated routes.
// We trust client-reported metric values (this is RUM, not a privileged API)
// but cap batch size and clamp values to prevent abuse / runaway storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cybernet-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_KINDS = new Set([
  "lcp", "fcp", "cls", "inp", "ttfb",
  "route", "error", "rejection", "nav",
]);

function clampString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}

function clampNumber(v: unknown): number | null {
  if (typeof v !== "number" || !isFinite(v)) return null;
  // Clamp wildly large values; vitals are in ms or unitless score < 100.
  return Math.max(-1e9, Math.min(1e9, v));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0 || events.length > 50) {
    return new Response(JSON.stringify({ error: "invalid_batch_size" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const sessionId = clampString(body?.session_id, 64);
  const buildId = clampString(body?.build_id, 32);
  const viewport = clampString(body?.viewport, 32);
  const userId = clampString(body?.user_id, 64); // optional, client-asserted

  const rows = events
    .map((e: any) => {
      const kind = clampString(e?.kind, 32);
      if (!kind || !ALLOWED_KINDS.has(kind)) return null;
      return {
        kind,
        route: clampString(e?.route, 200),
        value: clampNumber(e?.value),
        rating: clampString(e?.rating, 32),
        meta: e?.meta && typeof e.meta === "object" ? e.meta : {},
        user_id: userId,
        session_id: sessionId,
        build_id: buildId,
        ua,
        viewport,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("rum_events").insert(rows);
  if (error) {
    console.error("[rum-ingest] insert failed", error);
    return new Response(JSON.stringify({ error: "insert_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
