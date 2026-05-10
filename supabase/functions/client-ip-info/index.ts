// Server-side IP discovery + geolocation proxy.
// Keeps client IPs from being sent directly to third-party services from the browser.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function pickClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("fe80")) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  return false;
}

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let target = url.searchParams.get("ip");
    let body: any = null;
    if (!target && req.method === "POST") {
      try { body = await req.json(); } catch { /* ignore */ }
      target = body?.ip ?? null;
    }

    const myIp = pickClientIp(req);

    // No target → just return caller's IP
    if (!target) {
      return new Response(JSON.stringify({ ip: myIp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!IP_RE.test(target)) {
      return new Response(JSON.stringify({ error: "invalid ip" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isPrivateIp(target)) {
      return new Response(JSON.stringify({ ip: target, country: "Private network" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side geolocation lookup (browser never talks to third-party)
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(target)}/json/`);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const j = await r.json();
    return new Response(JSON.stringify({
      ip: target,
      country: j.country_name || undefined,
      country_code: j.country_code || undefined,
      city: j.city || undefined,
      region: j.region || undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
