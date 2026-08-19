// csrf-classification: authenticated step-up; JWT validated in code.
// Issues a fresh authentication challenge so a sensitive action can require a
// live fingerprint / Face ID confirmation.
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@13";
import {
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
  if (!rp) return json({ error: "Biometric confirmation requires a secure (https) connection" }, 400);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Not authenticated" }, 401);

  const db = adminClient();
  const { data: creds } = await db
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (!creds || creds.length === 0) return json({ enrolled: false });

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: creds.map((c: { credential_id: string; transports: string[] }) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as unknown as undefined,
    })),
    timeout: 90000,
  });

  await storeChallenge(db, {
    challenge: options.challenge,
    purpose: "stepup",
    userId: user.id,
    ttlSeconds: 90,
  });

  return json({ enrolled: true, options });
});
