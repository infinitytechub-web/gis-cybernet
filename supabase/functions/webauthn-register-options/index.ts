// csrf-classification: authenticated enrollment; JWT validated in code.
// Issues WebAuthn registration options so the caller can enroll this device's
// fingerprint / Face ID as a passkey. No biometric data is received or stored.
import { generateRegistrationOptions } from "npm:@simplewebauthn/server@13";
import {
  RP_NAME,
  adminClient,
  authenticatedUser,
  corsHeaders,
  json,
  relyingParty,
  storeChallenge,
} from "../_shared/webauthn.ts";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);

  const rp = relyingParty(req);
  if (!rp) return json({ error: "Biometric sign-in requires a secure (https) connection" }, 400);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Not authenticated" }, 401);

  const db = adminClient();

  const { data: settings } = await db.from("app_settings").select("biometric_login_enabled").limit(1).maybeSingle();
  if (settings && settings.biometric_login_enabled === false) {
    return json({ error: "Biometric sign-in is disabled for this organisation" }, 403);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("staff_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: existing } = await db
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: profile?.staff_id ?? user.email ?? user.id,
    userDisplayName: profile?.full_name ?? profile?.staff_id ?? "Cybernet staff",
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c: { credential_id: string; transports: string[] }) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as unknown as undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      // Platform authenticator only: the device's own fingerprint / face / PIN.
      authenticatorAttachment: "platform",
    },
    timeout: 120000,
  });

  await storeChallenge(db, {
    challenge: options.challenge,
    purpose: "register",
    userId: user.id,
    staffId: profile?.staff_id ?? null,
  });

  return json({ options });
});
