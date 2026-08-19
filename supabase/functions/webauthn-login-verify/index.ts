// csrf-classification: pre-login public: signature-verified assertion + lockout audit, CSRF N/A (unauth flow)
// Verifies a biometric assertion and, on success, mints a real session for the
// staff member. Failures feed the existing failed-login / lockout policy.
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13";
import {
  adminClient,
  audit,
  bytesFromB64url,
  clientIp,
  consumeChallenge,
  corsHeaders,
  json,
  relyingParty,
} from "../_shared/webauthn.ts";

function challengeFromClientData(clientDataJSON: string): string | null {
  try {
    const bin = atob(clientDataJSON.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).challenge ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rp = relyingParty(req);
  if (!rp) return json({ error: "Biometric sign-in requires a secure (https) connection" }, 400);

  let body: { staff_id?: unknown; response?: unknown; device_fingerprint?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const staffId = typeof body.staff_id === "string" ? body.staff_id.trim() : "";
  // deno-lint-ignore no-explicit-any
  const assertion = body.response as any;
  if (!staffId || !assertion?.id || !assertion?.response?.clientDataJSON) {
    return json({ error: "Invalid request" }, 400);
  }

  const db = adminClient();
  const ip = clientIp(req);
  const fingerprint = typeof body.device_fingerprint === "string"
    ? body.device_fingerprint.slice(0, 128)
    : null;

  const failGeneric = async (detail: string) => {
    await audit(db, req, "authenticate_failure", {
      staff_id: staffId,
      detail,
      device_fingerprint: fingerprint,
    });
    try {
      await db.rpc("record_failed_login", { _staff_id: staffId, _ip_address: ip });
    } catch (_e) { /* best effort */ }
    return json({ error: "Biometric sign-in failed. Use your password instead." }, 401);
  };

  const challenge = challengeFromClientData(assertion.response.clientDataJSON);
  if (!challenge) return await failGeneric("Malformed assertion");

  const stored = await consumeChallenge(db, challenge, "login");
  if (!stored || stored.staff_id !== staffId) {
    return await failGeneric("Challenge expired or mismatched");
  }

  const { data: cred } = await db
    .from("webauthn_credentials")
    .select("*")
    .eq("credential_id", assertion.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!cred || cred.user_id !== stored.user_id) {
    return await failGeneric("Unknown or revoked credential");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: bytesFromB64url(cred.public_key),
        counter: Number(cred.sign_count ?? 0),
        transports: cred.transports ?? undefined,
      },
    });
  } catch (_e) {
    return await failGeneric("Assertion verification failed");
  }

  if (!verification.verified) return await failGeneric("Assertion rejected");

  await db
    .from("webauthn_credentials")
    .update({
      sign_count: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", cred.id);

  // Mint a real session for the verified user.
  const { data: email } = await db.rpc("get_email_by_staff_id", { _staff_id: staffId });
  if (!email) return await failGeneric("Account not available");

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !link?.properties?.hashed_token) {
    await audit(db, req, "authenticate_failure", {
      user_id: cred.user_id,
      staff_id: staffId,
      detail: "Session could not be issued after successful biometric verification",
    });
    return json({ error: "Sign-in could not be completed. Please use your password." }, 500);
  }

  try {
    await db.rpc("clear_failed_login_attempts", { _staff_id: staffId });
  } catch (_e) { /* best effort */ }

  await audit(db, req, "authenticate_success", {
    user_id: cred.user_id,
    staff_id: staffId,
    credential_id: cred.credential_id,
    device_label: cred.device_label,
    detail: "Biometric sign-in succeeded (second factor satisfied by enrolled device)",
    device_fingerprint: fingerprint,
  });

  return json({
    verified: true,
    email,
    token_hash: link.properties.hashed_token,
    // A successful platform-authenticator assertion is a verified second factor.
    mfa_satisfied: true,
  });
});
