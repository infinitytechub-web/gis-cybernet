// Reverse geocode lat/lng → human-readable digital address using the
// Lovable-managed Google Maps connector. Auth required (verify_jwt is on by
// default for new functions; we additionally check the caller is signed in).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Caller must be signed in.
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ error: "Invalid coordinates" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const googleKey = Deno.env.get("LOVABLE_CONNECTOR_GOOGLE_MAPS_API_KEY");
    if (!lovableKey || !googleKey) {
      return new Response(JSON.stringify({ error: "Google Maps connector not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${GATEWAY}/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise|route|neighborhood|sublocality|locality`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": googleKey,
      },
    });
    const data = await r.json();

    let address: string | null = null;
    if (data?.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
      address = data.results[0].formatted_address ?? null;
    } else if (data?.status === "ZERO_RESULTS") {
      address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    return new Response(
      JSON.stringify({ address, lat, lng, raw_status: data?.status ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("reverse-geocode error", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
