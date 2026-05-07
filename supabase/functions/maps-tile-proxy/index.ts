// Server-side proxy for Google Maps raster tiles.
// Keeps GOOGLE_MAPS_API_KEY off the client. Auth-gated; rate-limited per user.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Map view -> Google Maps Tile API "mapType"
const VIEW_TO_TYPE: Record<string, "roadmap" | "satellite" | "terrain" | "hybrid"> = {
  streets: "roadmap",
  satellite: "satellite",
  terrain: "terrain",
  hybrid: "hybrid",
};

// In-memory per-user rate limit (best-effort; per-instance)
const RATE_BUCKET = new Map<string, { count: number; reset: number }>();
const LIMIT = 600; // tiles / minute / user
function rateLimited(uid: string) {
  const now = Date.now();
  const b = RATE_BUCKET.get(uid);
  if (!b || b.reset < now) {
    RATE_BUCKET.set(uid, { count: 1, reset: now + 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > LIMIT;
}

// Cache short-lived Google session tokens per (view, language) in this instance
const SESSIONS = new Map<string, { token: string; expiry: number }>();

async function getSession(view: string, apiKey: string): Promise<string> {
  const key = `${view}`;
  const now = Date.now();
  const existing = SESSIONS.get(key);
  if (existing && existing.expiry > now + 60_000) return existing.token;

  const mapType = VIEW_TO_TYPE[view];
  const res = await fetch(
    `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType,
        language: "en-US",
        region: "GH",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // Google returns expiry in seconds (string). Default to 12h if missing.
  const expirySec = parseInt(data.expiry ?? "0", 10) || Math.floor(now / 1000) + 12 * 3600;
  SESSIONS.set(key, { token: data.session, expiry: expirySec * 1000 });
  return data.session;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
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
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    if (rateLimited(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);

    // ── Preflight check: returns JSON describing tile API availability ──
    if (url.searchParams.get("preflight") === "1") {
      const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({
          ok: false, reason: "missing_key",
          message: "Google Maps API key is not configured on the server.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        await getSession("streets", apiKey);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        SESSIONS.delete("streets");
        const msg = (e as Error).message ?? "";
        const disabled = /SERVICE_DISABLED|accessNotConfigured|has not been used in project|Map Tiles API/i.test(msg);
        return new Response(JSON.stringify({
          ok: false,
          reason: disabled ? "api_disabled" : "unknown",
          message: disabled
            ? "Google Map Tiles API is disabled for this project. Enable it in Google Cloud Console, then refresh."
            : "Google tile service is unavailable. Falling back to OSM/Esri layers.",
          detail: msg.slice(0, 500),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Parse + validate tile coords ─────────────────────────────────────
    const view = (url.searchParams.get("view") ?? "streets").toLowerCase();
    const z = parseInt(url.searchParams.get("z") ?? "", 10);
    const x = parseInt(url.searchParams.get("x") ?? "", 10);
    const y = parseInt(url.searchParams.get("y") ?? "", 10);

    if (!VIEW_TO_TYPE[view]) {
      return new Response(JSON.stringify({ error: "Invalid view" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Number.isFinite(z) || z < 0 || z > 22) {
      return new Response(JSON.stringify({ error: "Invalid zoom" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const max = Math.pow(2, z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= max || y >= max) {
      return new Response(JSON.stringify({ error: "Invalid tile coords" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Maps not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1×1 transparent PNG returned when Google is misconfigured/unreachable.
    // Returning 200 (instead of 5xx) prevents the client from logging runtime
    // errors per tile and lets the user fall back to the OSM/Esri base layers.
    const TRANSPARENT_PNG = Uint8Array.from(atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    ), c => c.charCodeAt(0));
    const fallback = () => new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
        "X-Tile-Fallback": "1",
      },
    });

    let session: string;
    try {
      session = await getSession(view, apiKey);
    } catch (e) {
      console.error("maps-tile-proxy createSession failed", (e as Error).message);
      SESSIONS.delete(view);
      return fallback();
    }

    const tileUrl =
      `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}` +
      `?session=${encodeURIComponent(session)}&key=${encodeURIComponent(apiKey)}`;

    const tileRes = await fetch(tileUrl);
    if (!tileRes.ok) {
      if (tileRes.status === 401 || tileRes.status === 403) SESSIONS.delete(view);
      console.error("maps-tile-proxy tile fetch failed", tileRes.status);
      return fallback();
    }

    const buf = await tileRes.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": tileRes.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("maps-tile-proxy error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
