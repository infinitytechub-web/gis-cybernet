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
  const ip = clientIp(req);

  const { data: appSettings } = await db
    .from("app_settings")
    .select("biometric_login_enabled")
    .limit(1)
    .maybeSingle();
  if (appSettings && appSettings.biometric_login_enabled === false) {
    return json({ error: "Biometric sign-in is disabled for this organisation" }, 403);
  }

  // Existing lockout / IP-block policy applies before any credential lookup.
  try {
    const { data: locked } = await db.rpc("is_staff_locked", { _staff_id: staffId });
    if (locked === true) {
      return json({ error: "Account temporarily locked. Contact an administrator." }, 423);
    }
  } catch (_e) { /* fail open to the generic path below */ }

  try {
    const { data: blocked } = await db.rpc("is_ip_blocked", { _ip: ip });
    if (blocked === true) {
      return json({ error: "Access from this network is blocked." }, 403);
    }
  } catch (_e) { /* the RPC may not accept this shape; ignore */ }

  const { data: email } = await db.rpc("get_email_by_staff_id", { _staff_id: staffId });

  let userId: string | null = null;
  if (email) {
    const { data: profile } = await db
      .from("profiles")
      .select("user_id")
      .eq("staff_id", staffId)
      .maybeSingle();
    userId = profile?.user_id ?? null;
  }

  let credentials: { credential_id: string; transports: string[] }[] = [];
  if (userId) {
    const { data: enabled } = await db
      .from("webauthn_user_settings")
      .select("biometric_login_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (!enabled || enabled.biometric_login_enabled !== false) {
      const { data: creds } = await db
        .from("webauthn_credentials")
        .select("credential_id, transports")
        .eq("user_id", userId)
        .is("revoked_at", null);
      credentials = creds ?? [];
    }
  }

  // Uniform "not enrolled" answer for unknown IDs and known-but-unenrolled IDs.
  if (credentials.length === 0) {
    return json({ enrolled: false });
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as unknown as undefined,
    })),
    timeout: 120000,
  });

  await storeChallenge(db, {
    challenge: options.challenge,
    purpose: "login",
    userId,
    staffId,
  });

  return json({ enrolled: true, options });
});
