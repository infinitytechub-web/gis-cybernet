import { test, expect, request as pwRequest } from "@playwright/test";
import { signInToken } from "../support/auth";

/**
 * End-to-end coverage for the `admin-delete-staff-account` edge function.
 *
 * Includes a regression guard for the "shift_assignment_overrides is
 * append-only" cascade bug: deleting a stub profile that has rows in
 * shift_assignment_overrides must succeed once the trigger bypass for
 * service-role/admin callers is in place.
 *
 * Env vars (all optional → spec skipped if missing):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *   E2E_ADMIN_PROFILE_ID            — admin's own profile id (self-delete guard)
 *   E2E_DELETE_TARGET_PROFILE_ID    — disposable stub profile safe to delete
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/admin-delete-staff-account` : "";
const REST_PROFILES = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/profiles` : "";

async function invoke(token: string | null, body: unknown) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(FN_URL, {
    headers: {
      apikey: ANON_KEY!,
      "content-type": "application/json",
      "x-cybernet-app": "cybernet-web",
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

test.describe("admin-delete-staff-account edge function", () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, "E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY required");

  test("rejects unauthenticated callers with 401", async () => {
    const { status, body } = await invoke(null, {
      profile_id: "00000000-0000-0000-0000-000000000000",
      reason: "regression test",
    });
    expect(status).toBe(401);
    expect(body?.error).toMatch(/authorization|session/i);
  });

  test("rejects non-admin authenticated staff with 403", async () => {
    test.skip(!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD, "staff creds missing");
    const token = await signInToken(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
    const { status, body } = await invoke(token, {
      profile_id: "00000000-0000-0000-0000-000000000000",
      reason: "regression test",
    });
    expect(status).toBe(403);
    expect(body?.error).toMatch(/admin/i);
  });

  test.describe("as admin", () => {
    let adminToken: string;
    test.beforeAll(async () => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip(true, "admin creds missing");
      }
      adminToken = await signInToken(process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    });

    test("returns 400 when profile_id is missing", async () => {
      const { status, body } = await invoke(adminToken, { reason: "regression test" });
      expect(status).toBe(400);
      expect(body?.error).toMatch(/profile_id/i);
    });

    test("returns 400 when reason is too short", async () => {
      const { status, body } = await invoke(adminToken, {
        profile_id: "00000000-0000-0000-0000-000000000000",
        reason: "no",
      });
      expect(status).toBe(400);
      expect(body?.error).toMatch(/reason/i);
    });

    test("returns 404 for unknown profile_id", async () => {
      const { status, body } = await invoke(adminToken, {
        profile_id: "00000000-0000-0000-0000-000000000000",
        reason: "regression test",
      });
      expect(status).toBe(404);
      expect(body?.error).toMatch(/not found/i);
    });

    test("rejects deletion of own admin profile", async () => {
      const self = process.env.E2E_ADMIN_PROFILE_ID;
      test.skip(!self, "E2E_ADMIN_PROFILE_ID not provided");
      const { status, body } = await invoke(adminToken, {
        profile_id: self,
        reason: "regression test self-delete guard",
      });
      expect(status).toBe(400);
      expect(body?.error).toMatch(/own account/i);
    });

    test("rejects deletion of reserved system accounts (ADMIN-001)", async () => {
      // Look up ADMIN-001 by staff_id rather than hard-coding the uuid.
      const ctx = await pwRequest.newContext();
      const lookup = await ctx.fetch(`${REST_PROFILES}?staff_id=eq.ADMIN-001&select=id`, {
        headers: { apikey: ANON_KEY!, Authorization: `Bearer ${adminToken}` },
      });
      const rows = (await lookup.json()) as any[];
      await ctx.dispose();
      test.skip(!rows?.[0]?.id, "ADMIN-001 not found in this environment");
      const { status, body } = await invoke(adminToken, {
        profile_id: rows[0].id,
        reason: "regression test reserved-account guard",
      });
      expect(status).toBe(400);
      expect(body?.error).toMatch(/protected system account/i);
    });

    test("successfully deletes a stub profile and cascades cleanly (append-only regression)", async () => {
      const target = process.env.E2E_DELETE_TARGET_PROFILE_ID;
      test.skip(!target, "E2E_DELETE_TARGET_PROFILE_ID not provided");
      const { status, body } = await invoke(adminToken, {
        profile_id: target,
        reason: "regression: admin can delete despite shift_assignment_overrides cascade",
      });
      expect(status, JSON.stringify(body)).toBe(200);
      expect(body?.ok).toBe(true);

      // Confirm hard delete.
      const ctx = await pwRequest.newContext();
      const after = await ctx.fetch(`${REST_PROFILES}?id=eq.${target}&select=id`, {
        headers: { apikey: ANON_KEY!, Authorization: `Bearer ${adminToken}` },
      });
      const remaining = (await after.json()) as any[];
      await ctx.dispose();
      expect(remaining).toHaveLength(0);
    });
  });
});
