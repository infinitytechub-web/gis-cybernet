import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * End-to-end coverage for the `admin-reset-password` edge function.
 *
 * Scenarios:
 *  1. Unauthenticated caller          → 401
 *  2. Authenticated non-admin staff   → 403 (RBAC enforcement)
 *  3. Admin + non-existent profile_id → 404
 *  4. Admin + profile w/ no auth user → 400 ("Profile has no linked auth account")
 *  5. Admin + valid linked profile    → 200 with temporary_password + must_change_password
 *
 * Env vars required (CI):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_TEST_EMAIL,  E2E_TEST_PASSWORD          (non-admin staff)
 *   E2E_RESET_TARGET_PROFILE_ID                 (profile with linked auth user, safe to reset)
 *   E2E_ORPHAN_PROFILE_ID                       (profile with user_id = null)
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/admin-reset-password` : "";

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

async function invoke(token: string | null, body: unknown) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(FN_URL, {
    headers: {
      apikey: ANON_KEY!,
      "content-type": "application/json",
      // Custom header satisfies edge function CSRF guard for browser-style calls.
      "x-cybernet-app": "1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: body as any,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  await ctx.dispose();
  return { status: res.status(), body: parsed, raw: text };
}

test.describe("admin-reset-password edge function", () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY,
    "E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY required",
  );

  test("rejects unauthenticated callers with 401", async () => {
    const { status, body } = await invoke(null, { profile_id: "00000000-0000-0000-0000-000000000000" });
    expect(status).toBe(401);
    expect(body?.error).toMatch(/authorization|session/i);
  });

  test("rejects non-admin authenticated staff with 403", async () => {
    test.skip(!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD, "non-admin creds missing");
    const token = await signIn(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
    const { status, body } = await invoke(token, { profile_id: "00000000-0000-0000-0000-000000000000" });
    expect(status).toBe(403);
    expect(body?.error).toMatch(/admin/i);
  });

  test.describe("as admin", () => {
    let adminToken: string;
    test.beforeAll(async () => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip(true, "admin creds missing");
      }
      adminToken = await signIn(process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    });

    test("returns 400 when profile_id is missing", async () => {
      const { status, body } = await invoke(adminToken, {});
      expect(status).toBe(400);
      expect(body?.error).toMatch(/profile_id/i);
    });

    test("returns 404 for unknown profile_id", async () => {
      const { status, body } = await invoke(adminToken, {
        profile_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(status).toBe(404);
      expect(body?.error).toMatch(/not found/i);
    });

    test("returns 400 when target profile has no linked auth account", async () => {
      const orphan = process.env.E2E_ORPHAN_PROFILE_ID;
      test.skip(!orphan, "E2E_ORPHAN_PROFILE_ID not provided");
      const { status, body } = await invoke(adminToken, { profile_id: orphan });
      expect(status).toBe(400);
      expect(body?.error).toMatch(/no linked auth account/i);
    });

    test("issues a temporary password for a valid linked profile", async () => {
      const target = process.env.E2E_RESET_TARGET_PROFILE_ID;
      test.skip(!target, "E2E_RESET_TARGET_PROFILE_ID not provided");
      const { status, body } = await invoke(adminToken, { profile_id: target });
      expect(status).toBe(200);
      expect(body?.temporary_password).toBeTruthy();
      expect(String(body?.temporary_password ?? "").length).toBeGreaterThanOrEqual(12);
      expect(body?.must_change_password).toBe(true);
      expect(body?.staff_id).toBeTruthy();
    });
  });
});
