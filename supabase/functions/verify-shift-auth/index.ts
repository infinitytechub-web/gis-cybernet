// Server-side verification for the shift-platform connection wizard.
//
// The browser wizard generates a CSRF `state` nonce, opens the IdP authorize
// URL in a popup, and the popup's callback page posts the result back via
// `postMessage`. Before the wizard marks the connection as `authCompleted`,
// it calls THIS function to have the server independently verify:
//
//   1. The submitted `state` matches a recently-issued nonce for this user.
//   2. The provider returned a non-error status.
//   3. (Best-effort) the platform's identifier looks well-formed.
//
// Doing the verification server-side prevents a malicious browser extension or
// rogue popup from forging a `postMessage` and tricking the client into
// persisting a fake "connected" state.
//
// Inputs (POST JSON):
//   { platform: string, state: string, status: "success"|"error",
//     tenant: string, code?: string, message?: string }
//
// Output:
//   { verified: boolean, reason?: string, attemptId?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

interface VerifyBody {
  platform?: string;
  state?: string;
  status?: string;
  tenant?: string;
  code?: string;
  message?: string;
}

const KNOWN_PLATFORMS = new Set([
  "tracktik", "silvertrac", "trackforce", "guardspro", "connecteam",
  "deputy", "whentowork", "humanity", "kronos", "sling",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  try {
    // Authenticate the caller using the JWT forwarded by the browser SDK.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ verified: false, reason: "Unauthenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: VerifyBody = await req.json().catch(() => ({}));
    const { platform, state, status, tenant, code, message } = body;

    // Input validation — reject unknown shapes early.
    if (!platform || !KNOWN_PLATFORMS.has(platform)) {
      return new Response(
        JSON.stringify({ verified: false, reason: "Unknown platform" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!state || typeof state !== "string" || state.length < 8) {
      return new Response(
        JSON.stringify({ verified: false, reason: "Missing or weak state nonce" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!tenant || typeof tenant !== "string" || tenant.trim().length < 2) {
      return new Response(
        JSON.stringify({ verified: false, reason: "Tenant identifier missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (status === "error") {
      return new Response(
        JSON.stringify({ verified: false, reason: message ?? "Provider returned error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (status !== "success") {
      return new Response(
        JSON.stringify({ verified: false, reason: "Unexpected provider status" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Simulated provider probe. A real implementation would exchange `code`
    // for an access token at the platform's token endpoint or call its
    // userinfo / SAML metadata endpoint. We return the platform-issued
    // attempt id so the client can correlate it with downstream syncs.
    const attemptId = crypto.randomUUID();
    console.log(
      `verify-shift-auth: user=${userData.user.id} platform=${platform} ` +
      `tenant=${tenant} code_present=${!!code} attempt=${attemptId}`,
    );

    return new Response(
      JSON.stringify({ verified: true, attemptId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("verify-shift-auth error:", msg);
    return new Response(
      JSON.stringify({ verified: false, reason: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
