// csrf-classification: authenticated step-up; JWT validated in code.
// Verifies a fresh biometric assertion (or password re-entry) and issues a
// short-lived, single-use step-up token bound to the caller and the action.
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  adminClient,
  audit,
  authenticatedUser,
  bytesFromB64url,
  consumeChallenge,
  corsHeaders,
  json,
  relyingParty,
  sha256Hex,
} from "../_shared/webauthn.ts";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const ALLOWED_ACTIONS = new Set([
  "password_reset",
  "account_create",
  "account_delete",
  "role_grant",
  "command_role_grant",
  "recycle_bin_purge",
  "backup_restore",
  "data_export",
]);

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

  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Not authenticated" }, 401);

  let body: { action?: unknown; response?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!ALLOWED_ACTIONS.has(action)) return json({ error: "Unknown sensitive action" }, 400);

  const db = adminClient();
  let method: "biometric" | "password" | null = null;

  if (body.response) {
    const rp = relyingParty(req);
    if (!rp) return json({ error: "Biometric confirmation requires a secure connection" }, 400);

    // deno-lint-ignore no-explicit-any
    const assertion = body.response as any;
    const challenge = assertion?.response?.clientDataJSON
      ? challengeFromClientData(assertion.response.clientDataJSON)
      : null;
    if (!challenge) return json({ error: "Invalid confirmation" }, 400);

    const stored = await consumeChallenge(db, challenge, "stepup");
    if (!stored || stored.user_id !== user.id) {
      await audit(db, req, "stepup_failure", { user_id: user.id, detail: `Expired challenge for ${action}` });
      return json({ error: "Confirmation expired — please try again" }, 400);
    }

    const { data: cred } = await db
      .from("webauthn_credentials")
      .select("*")
      .eq("credential_id", assertion.id)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (!cred) {
      await audit(db, req, "stepup_failure", { user_id: user.id, detail: `Unknown credential for ${action}` });
      return json({ error: "This device is not enrolled" }, 400);
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: relyingParty(req)!.origin,
        expectedRPID: relyingParty(req)!.rpID,
        requireUserVerification: true,
        credential: {
          id: cred.credential_id,
          publicKey: bytesFromB64url(cred.public_key),
          counter: Number(cred.sign_count ?? 0),
          transports: cred.transports ?? undefined,
        },
      });
      if (!verification.verified) throw new Error("rejected");
      await db
        .from("webauthn_credentials")
        .update({
          sign_count: verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", cred.id);
      method = "biometric";
    } catch (_e) {
      await audit(db, req, "stepup_failure", { user_id: user.id, detail: `Assertion rejected for ${action}` });
      return json({ error: "Biometric confirmation failed" }, 401);
    }
  } else if (typeof body.password === "string" && body.password.length > 0) {
    // Password fallback: re-authenticate against the caller's own account only.
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error } = await authClient.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
    if (error) {
      await audit(db, req, "stepup_failure", { user_id: user.id, detail: `Password re-entry failed for ${action}` });
      return json({ error: "Incorrect password" }, 401);
    }
    method = "password";
  } else {
    return json({ error: "Provide a biometric confirmation or your password" }, 400);
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256Hex(token);

  await db.from("webauthn_stepup_tokens").insert({
    token_hash: tokenHash,
    user_id: user.id,
    action,
    method,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });

  return json({ verified: true, method, token, token_hash: tokenHash, expires_in: 300 });
});
