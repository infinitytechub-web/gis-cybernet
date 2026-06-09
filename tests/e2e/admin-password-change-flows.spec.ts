import { test, expect, request as pwRequest } from "@playwright/test";
import { signInToken } from "../support/auth";

/**
 * Full admin → user password lifecycle regression.
 *
 * 1. Admin resets a target staff password via the `admin-reset-password`
 *    edge function and receives a temporary password.
 * 2. Target signs in with the temporary password; JWT carries
 *    `user_metadata.must_change_password === true`.
 * 3. Target updates their own password via `supabase.auth.updateUser`.
 * 4. New password works on a fresh sign-in; metadata flag clears.
 * 5. Old temporary password is rejected.
 * 6. Admin re-resets so the account is left in a known state for the next run.
 *
 * Env vars (all optional → spec skipped if missing):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_RESET_TARGET_PROFILE_ID   — disposable profile with linked auth user
 *   E2E_RESET_TARGET_EMAIL        — that profile's login email
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const FN_RESET = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/admin-reset-password` : "";

async function adminResetPassword(token: string, profileId: string) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(FN_RESET, {
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-cybernet-app": "cybernet-web",
    },
    data: { profile_id: profileId },
  });
  const text = await res.text();
  await ctx.dispose();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status(), body, raw: text };
}

async function passwordSignIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body, raw: text };
}

async function updateOwnPassword(token: string, newPassword: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      password: newPassword,
      data: { must_change_password: false },
    }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body, raw: text };
}

test.describe("admin password reset lifecycle", () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY ||
      !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD ||
      !process.env.E2E_RESET_TARGET_PROFILE_ID ||
      !process.env.E2E_RESET_TARGET_EMAIL,
    "Admin reset lifecycle env vars missing",
  );

  // Single chained test so steps share state and don't interleave.
  test("admin reset → user changes password → old temp rejected", async () => {
    const adminToken = await signInToken(process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    const targetId = process.env.E2E_RESET_TARGET_PROFILE_ID!;
    const targetEmail = process.env.E2E_RESET_TARGET_EMAIL!;

    // 1. Admin resets to a temp password.
    const reset1 = await adminResetPassword(adminToken, targetId);
    expect(reset1.status, JSON.stringify(reset1.body)).toBe(200);
    const tempPw = reset1.body?.temporary_password as string;
    expect(tempPw?.length).toBeGreaterThanOrEqual(12);
    expect(reset1.body?.must_change_password).toBe(true);

    // 2. Target signs in with the temp password and carries the flag.
    const signIn1 = await passwordSignIn(targetEmail, tempPw);
    expect(signIn1.status, signIn1.raw).toBe(200);
    expect(signIn1.body?.user?.user_metadata?.must_change_password).toBe(true);
    const tempAccess = signIn1.body?.access_token as string;
    expect(tempAccess).toBeTruthy();

    // 3. Target updates their password using the temp session.
    const newPw = `Regress!${Date.now()}A1`;
    const upd = await updateOwnPassword(tempAccess, newPw);
    expect(upd.status, upd.raw).toBe(200);

    // 4. New password works on fresh login and flag is now false.
    const signIn2 = await passwordSignIn(targetEmail, newPw);
    expect(signIn2.status, signIn2.raw).toBe(200);
    expect(signIn2.body?.user?.user_metadata?.must_change_password).toBe(false);

    // 5. Old temp password is rejected.
    const signInOld = await passwordSignIn(targetEmail, tempPw);
    expect(signInOld.status).toBeGreaterThanOrEqual(400);
    expect(signInOld.status).toBeLessThan(500);

    // 6. Re-reset so the next CI run starts from a known temp-password state.
    const reset2 = await adminResetPassword(adminToken, targetId);
    expect(reset2.status, JSON.stringify(reset2.body)).toBe(200);
    expect(reset2.body?.must_change_password).toBe(true);
  });
});
