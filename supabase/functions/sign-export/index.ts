// Signs export metadata with HMAC-SHA256 using EXPORT_SIGNING_SECRET.
// Auth-gated: caller must be a logged-in user. Returns a signature string.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (error || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as
      | { contentSha256?: string; kind?: string; range?: string; recordCount?: number; verifySignature?: string; verifyPayload?: Record<string, unknown> }
      | null;
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("EXPORT_SIGNING_SECRET");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Signing not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verification mode
    if (body.verifySignature && body.verifyPayload) {
      const canon = JSON.stringify(body.verifyPayload, Object.keys(body.verifyPayload).sort());
      const expected = await hmacSha256Hex(secret, canon);
      const ok = expected === body.verifySignature;
      return new Response(JSON.stringify({ valid: ok }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signing mode
    if (!body.contentSha256 || !/^[0-9a-f]{64}$/i.test(body.contentSha256)) {
      return new Response(JSON.stringify({ error: "Invalid contentSha256" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payload = {
      content_sha256: body.contentSha256.toLowerCase(),
      kind: String(body.kind ?? "export"),
      range: String(body.range ?? ""),
      record_count: Number(body.recordCount ?? 0),
      user_id: claims.claims.sub as string,
      issued_at: new Date().toISOString(),
      issuer: "gis-cybernet:route-history",
      version: 1,
    };
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = await hmacSha256Hex(secret, canonical);

    return new Response(JSON.stringify({ payload, signature, algorithm: "HMAC-SHA256" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sign-export error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
