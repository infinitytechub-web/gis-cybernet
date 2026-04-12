import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "Missing hCaptcha token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("HCAPTCHA_SECRET_KEY");
    if (!secret) {
      // If no secret configured, pass through (dev mode)
      console.warn("HCAPTCHA_SECRET_KEY not configured, allowing request");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyResponse = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `response=${token}&secret=${secret}`,
    });

    const result = await verifyResponse.json();

    return new Response(JSON.stringify({ success: result.success }), {
      status: result.success ? 200 : 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("hCaptcha verification error:", error);
    return new Response(JSON.stringify({ success: false, error: "Verification failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
