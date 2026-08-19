// csrf-classification: authenticated enrollment; JWT validated in code.
// Verifies the device's registration response and stores only the public key.
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@13";
import {
  adminClient,
  audit,
  authenticatedUser,
  b64urlFromBytes,
  consumeChallenge,
  corsHeaders,
  deviceLabelFromUserAgent,
  json,
  relyingParty,
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

  let body: { response?: unknown; device_label?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  if (body.consent !== true) {
    return json({ error: "Explicit consent is required before biometric enrollment" }, 400);
  }

  // deno-lint-ignore no-explicit-any
  const attResponse = body.response as any;
  const challenge = attResponse?.response?.clientDataJSON
    ? JSON.parse(new TextDecoder().decode(
      Uint8Array.from(
        atob(attResponse.response.clientDataJSON.replace(/-/g, "+").replace(/_/g, "/")),
        (c: string) => c.charCodeAt(0),
      ),
    )).challenge
    : null;

  if (!challenge) return json({ error: "Invalid registration response" }, 400);

  const db = adminClient();
  const stored = await consumeChallenge(db, challenge, "register");
  if (!stored || stored.user_id !== user.id) {
    return json({ error: "Enrollment challenge expired — please try again" }, 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attResponse,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch (_e) {
    await audit(db, req, "authenticate_failure", {
      user_id: user.id,
      detail: "Biometric enrollment verification failed",
      actor_id: user.id,
    });
    return json({ error: "Biometric enrollment could not be verified" }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: "Biometric enrollment could not be verified" }, 400);
  }

  const info = verification.registrationInfo;
  const label = typeof body.device_label === "string" && body.device_label.trim()
    ? body.device_label.trim().slice(0, 80)
    : deviceLabelFromUserAgent(req.headers.get("user-agent") ?? "");

  const { error: insertError } = await db.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: info.credential.id,
    public_key: b64urlFromBytes(info.credential.publicKey),
    sign_count: info.credential.counter ?? 0,
    transports: info.credential.transports ?? [],
    aaguid: info.aaguid ?? null,
    device_label: label,
    backed_up: info.credentialBackedUp ?? false,
    user_verified: true,
  });

  if (insertError) {
    return json({ error: "This device is already enrolled" }, 400);
  }

  // Enrolling implies the user wants biometric sign-in on; record the consent.
  await db.from("webauthn_user_settings").upsert({
    user_id: user.id,
    biometric_login_enabled: true,
    consented_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  await audit(db, req, "enroll", {
    user_id: user.id,
    staff_id: stored.staff_id,
    credential_id: info.credential.id,
    device_label: label,
    detail: "Biometric credential enrolled",
    actor_id: user.id,
  });

  return json({ verified: true, device_label: label });
});
