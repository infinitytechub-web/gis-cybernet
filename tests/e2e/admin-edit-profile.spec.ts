import { test, expect, request as pwRequest } from "@playwright/test";
import { signInToken } from "../support/auth";

/**
 * Regression coverage for the `restrict_profile_updates` trigger.
 * Confirms System Administrators can mutate every protected profile field
 * while non-admin staff are still blocked by the trigger.
 *
 * Env vars (all optional → spec is skipped if missing):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *   E2E_EDIT_TARGET_PROFILE_ID   — disposable profile safe to mutate
 *   E2E_ALT_RANK_ID              — alternate rank to swap to/from
 *   E2E_OTHER_DEPARTMENT_ID      — non-MISD department for swap test
 *   E2E_MISD_DEPARTMENT_ID       — MISD department id (optional, enables MISD case)
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const TARGET = process.env.E2E_EDIT_TARGET_PROFILE_ID;
const ALT_RANK = process.env.E2E_ALT_RANK_ID;
const OTHER_DEPT = process.env.E2E_OTHER_DEPARTMENT_ID;
const MISD_DEPT = process.env.E2E_MISD_DEPARTMENT_ID;

const REST_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/profiles` : "";

async function patchProfile(token: string, id: string, payload: Record<string, unknown>) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.fetch(`${REST_URL}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      Prefer: "return=representation",
      "x-cybernet-app": "cybernet-web",
    },
    data: payload,
  });
  const text = await res.text();
  await ctx.dispose();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status(), body, raw: text };
}

async function getProfile(token: string, id: string) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.fetch(`${REST_URL}?id=eq.${id}&select=*`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as any[];
  await ctx.dispose();
  return json?.[0] ?? null;
}

test.describe("admin profile edits (restrict_profile_updates bypass)", () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY || !TARGET || !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    "E2E_SUPABASE_URL / ANON_KEY / ADMIN creds / E2E_EDIT_TARGET_PROFILE_ID required",
  );

  let adminToken: string;
  let original: Record<string, unknown> | null = null;

  test.beforeAll(async () => {
    adminToken = await signInToken(process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    original = await getProfile(adminToken, TARGET!);
    expect(original, "target profile must exist").not.toBeNull();
  });

  test.afterAll(async () => {
    if (!original) return;
    // Restore the snapshotted values so the spec is idempotent.
    const restore: Record<string, unknown> = {};
    for (const k of [
      "other_names", "rank_id", "department_id", "staff_id",
      "shift_group", "unit", "account_locked", "login_enabled", "status",
    ]) {
      if (k in original!) restore[k] = (original as any)[k];
    }
    await patchProfile(adminToken, TARGET!, restore);
  });

  test("admin can update non-restricted field (other_names)", async () => {
    const stamp = `qa-${Date.now()}`;
    const { status, body } = await patchProfile(adminToken, TARGET!, { other_names: stamp });
    expect(status, body).toBeLessThan(300);
    expect(body?.[0]?.other_names).toBe(stamp);
  });

  test("admin can change rank_id", async () => {
    test.skip(!ALT_RANK, "E2E_ALT_RANK_ID not provided");
    const { status, body } = await patchProfile(adminToken, TARGET!, { rank_id: ALT_RANK });
    expect(status, body).toBeLessThan(300);
    expect(body?.[0]?.rank_id).toBe(ALT_RANK);
  });

  test("admin can change department_id", async () => {
    test.skip(!OTHER_DEPT, "E2E_OTHER_DEPARTMENT_ID not provided");
    const { status, body } = await patchProfile(adminToken, TARGET!, { department_id: OTHER_DEPT });
    expect(status, body).toBeLessThan(300);
    expect(body?.[0]?.department_id).toBe(OTHER_DEPT);
  });

  test("admin can move profile into MISD/CYBER", async () => {
    test.skip(!MISD_DEPT, "E2E_MISD_DEPARTMENT_ID not provided");
    const { status, body } = await patchProfile(adminToken, TARGET!, { department_id: MISD_DEPT });
    expect(status, body).toBeLessThan(300);
    expect(body?.[0]?.department_id).toBe(MISD_DEPT);
  });

  test("admin can toggle restricted scalar fields", async () => {
    const newStaffId = `${(original?.staff_id as string) ?? "QA"}-${Date.now().toString().slice(-4)}`;
    const payload = {
      staff_id: newStaffId,
      shift_group: ((original?.shift_group as string) === "A" ? "B" : "A"),
      unit: `qa-unit-${Date.now()}`,
      account_locked: !(original?.account_locked as boolean ?? false),
      login_enabled: !(original?.login_enabled as boolean ?? true),
      status: "active",
    };
    const { status, body } = await patchProfile(adminToken, TARGET!, payload);
    expect(status, body).toBeLessThan(300);
    const row = body?.[0];
    expect(row?.staff_id).toBe(payload.staff_id);
    expect(row?.shift_group).toBe(payload.shift_group);
    expect(row?.unit).toBe(payload.unit);
    expect(row?.account_locked).toBe(payload.account_locked);
    expect(row?.login_enabled).toBe(payload.login_enabled);
  });

  test("non-admin staff is blocked by restrict_profile_updates trigger", async () => {
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      "non-admin staff creds missing",
    );
    const staffToken = await signInToken(process.env.E2E_TEST_EMAIL!, process.env.E2E_TEST_PASSWORD!);
    const { status, raw } = await patchProfile(staffToken, TARGET!, { rank_id: ALT_RANK ?? original?.rank_id });
    // Either RLS denies (403/401/406) or the trigger raises and PostgREST surfaces a 4xx with the message.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    if (status >= 400 && raw) {
      expect(raw.toLowerCase()).toMatch(/admin|permission|denied|rank/);
    }
  });
});
