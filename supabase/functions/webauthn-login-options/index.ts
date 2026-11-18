// csrf-classification: pre-login public: uniform responses + lockout checks, CSRF N/A (unauth flow)
// Returns WebAuthn authentication options for a Staff/Admin ID. The response is
// deliberately uniform so it cannot be used to enumerate staff identifiers.
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@13";
import {
  adminClient,
  clientIp,
  corsHeaders,
  json,
  relyingParty,
  storeChallenge,
} from "../_shared/webauthn.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rp = relyingParty(req);
  if (!rp) return json({ error: "Biometric sign-in requires a secure (https) connection" }, 400);

  let body: { staff_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const staffId = typeof body.staff_id === "string" ? body.staff_id.trim() : "";
  if (!staffId || staffId.length < 2 || staffId.length > 64 || !/^[A-Za-z0-9._-]+$/.test(staffId)) {
    return json({ error: "Enter your Staff ID first" }, 400);
  }

  const db = adminClient();

  const { data: appSettings } = await db
    .from("app_settings")
    .select("biometric_login_enabled")
    .limit(1)
    .maybeSingle();
  if (appSettings && appSettings.biometric_login_enabled === false) {
    return json({ error: "Biometric sign-in is disabled for this organisation" }, 403);
  }

  // Network policy is account-independent and does not disclose enrollment.
  const { data: blocked } = await db.rpc("is_ip_blocked", { _ip: clientIp(req) });
  if (blocked === true) return json({ error: "Access from this network is blocked." }, 403);

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: [],
    timeout: 120000,
  });

  await storeChallenge(db, {
    challenge: options.challenge,
    purpose: "login",
    staffId,
  });

  return json({ options });
});
