import { test, expect, request as pwRequest, type APIRequestContext, type Page } from "@playwright/test";
import { signInAs } from "../support/auth";

/**
 * End-to-end coverage for the bulk-action workflow on /staff-approvals/pending.
 *
 * Drives the real UI in the preview build against a real Supabase sandbox:
 *   - Seeds a unique batch of `pending_staff_matches` rows via PostgREST (admin JWT)
 *   - Logs in as an admin and exercises the Approve / Delete (reject) bulk paths
 *   - Verifies the database is updated consistently (status flipped, profiles
 *     reactivated/removed) for every selected row
 *   - Confirms the Merge bulk action with >1 row is gated and does NOT mutate
 *
 * Required env (CI):
 *   E2E_BASE_URL                  preview origin (default http://localhost:4173)
 *   E2E_SUPABASE_URL              Supabase project URL
 *   E2E_SUPABASE_ANON_KEY         anon key
 *   E2E_ADMIN_EMAIL               admin login (e.g. admin.cybernet@gis.local)
 *   E2E_ADMIN_PASSWORD            admin password
 *
 * Optional:
 *   E2E_ROSTER_IMPORT_ID          existing duty_roster_imports.id to attach
 *                                 seeded matches to. If unset the spec creates
 *                                 a throwaway import row and cleans it up.
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
// Destructive spec — opt in explicitly. CI runs read-only a11y + non-destructive
// e2e by default; set E2E_RUN_DESTRUCTIVE=1 to enable the bulk write flow.
const OPT_IN = process.env.E2E_RUN_DESTRUCTIVE === "1";
const skipAll = !OPT_IN || !SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD;

const REST = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "";

// ------------------------------------------------------------------
// REST helpers — every call carries the admin JWT so RLS allows writes
// ------------------------------------------------------------------
async function getAdminToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin sign-in failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    apikey: ANON_KEY!,
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function restGet(ctx: APIRequestContext, token: string, path: string) {
  const res = await ctx.get(`${REST}${path}`, { headers: authHeaders(token) });
  if (!res.ok()) throw new Error(`GET ${path} failed ${res.status()}: ${await res.text()}`);
  return res.json();
}

async function restPost(ctx: APIRequestContext, token: string, path: string, body: unknown) {
  const res = await ctx.post(`${REST}${path}`, {
    headers: authHeaders(token, { Prefer: "return=representation" }),
    data: body as any,
  });
  if (!res.ok()) throw new Error(`POST ${path} failed ${res.status()}: ${await res.text()}`);
  return res.json();
}

async function restDelete(ctx: APIRequestContext, token: string, path: string) {
  const res = await ctx.delete(`${REST}${path}`, { headers: authHeaders(token) });
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`DELETE ${path} failed ${res.status()}: ${await res.text()}`);
  }
}

// ------------------------------------------------------------------
// Seed/teardown — creates N pending_staff_matches rows under a tag the
// spec owns end-to-end, plus matching auto-created profile stubs.
// ------------------------------------------------------------------
interface SeedRow { id: string; created_profile_id: string; name_text: string }

async function seedPending(
  ctx: APIRequestContext,
  token: string,
  tag: string,
  importId: string,
  n: number,
): Promise<SeedRow[]> {
  // 1. Auto-stub profiles (login disabled — matches Roster Auto Match behaviour)
  const profilesPayload = Array.from({ length: n }).map((_, i) => ({
    first_name: `BulkE2E${i}`,
    last_name: tag,
    staff_id: `${tag}-${i}`.toUpperCase().slice(0, 30),
    login_enabled: false,
  }));
  const profiles = (await restPost(ctx, token, "/profiles", profilesPayload)) as Array<{ id: string }>;

  // 2. pending_staff_matches pointing at the stubs
  const matchesPayload = profiles.map((p, i) => ({
    import_id: importId,
    rank_text: "Inspector",
    name_text: `Bulk E2E ${tag} ${i}`,
    serial_no: i + 1,
    shift: ["A", "B", "C", "D"][i % 4],
    status: "pending",
    created_profile_id: p.id,
  }));
  const matches = (await restPost(ctx, token, "/pending_staff_matches", matchesPayload)) as Array<{
    id: string; created_profile_id: string; name_text: string;
  }>;
  return matches;
}

async function cleanupSeed(
  ctx: APIRequestContext,
  token: string,
  matchIds: string[],
  profileIds: string[],
) {
  if (matchIds.length) {
    const ids = matchIds.map((id) => `"${id}"`).join(",");
    await restDelete(ctx, token, `/pending_staff_matches?id=in.(${ids})`);
  }
  if (profileIds.length) {
    const ids = profileIds.map((id) => `"${id}"`).join(",");
    await restDelete(ctx, token, `/profiles?id=in.(${ids})`);
  }
}

async function ensureImport(ctx: APIRequestContext, token: string): Promise<{ id: string; created: boolean }> {
  if (process.env.E2E_ROSTER_IMPORT_ID) {
    return { id: process.env.E2E_ROSTER_IMPORT_ID, created: false };
  }
  const rows = (await restPost(ctx, token, "/duty_roster_imports", [{
    period_label: `BulkE2E-${Date.now()}`,
    source_filename: "bulk-e2e.xlsx",
    status: "committed",
  }])) as Array<{ id: string }>;
  return { id: rows[0].id, created: true };
}

// ------------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------------
async function gotoAsAdmin(page: Page, path: string) {
  await signInAs(page, "admin");
  await page.goto(path);
  // Page renders nothing until AuthProvider resolves — wait for the heading.
  await expect(page.getByRole("heading", { name: /Pending Staff Approvals/i })).toBeVisible();
}

function bulkBar(page: Page) {
  return page.locator('div').filter({ hasText: /^\d+ records? selected/ }).first();
}

async function selectSeededRows(page: Page, names: string[]) {
  // Each row checkbox uses aria-label "Select <name_text>"
  for (const name of names) {
    await page.getByRole("checkbox", { name: `Select ${name}` }).check();
  }
  await expect(bulkBar(page)).toContainText(`${names.length} record`);
}

// ------------------------------------------------------------------
// Test suite
// ------------------------------------------------------------------
test.describe("Pending Staff Approvals — bulk actions (Supabase sandbox)", () => {
  test.skip(skipAll, "E2E Supabase + admin credentials required");

  let adminToken: string;
  let api: APIRequestContext;
  let importId: string;
  let importCreated = false;

  test.beforeAll(async () => {
    adminToken = await getAdminToken();
    api = await pwRequest.newContext();
    const imp = await ensureImport(api, adminToken);
    importId = imp.id;
    importCreated = imp.created;
  });

  test.afterAll(async () => {
    if (importCreated) await restDelete(api, adminToken, `/duty_roster_imports?id=eq.${importId}`);
    await api.dispose();
  });

  test("bulk approve flips status to approved and reactivates every selected profile", async ({ page }) => {
    const tag = `APV${Date.now()}`;
    const seeded = await seedPending(api, adminToken, tag, importId, 4);
    const matchIds = seeded.map((r) => r.id);
    const profileIds = seeded.map((r) => r.created_profile_id);

    try {
      await gotoAsAdmin(page, "/staff-approvals/pending");
      await expect(page.getByText(seeded[0].name_text)).toBeVisible();

      await selectSeededRows(page, seeded.map((r) => r.name_text));

      // Open confirmation dialog from the bulk bar (avoids per-row Approve buttons)
      await bulkBar(page).getByRole("button", { name: /^Approve$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(/Approve 4 records\?/i);

      // DB still untouched before confirm
      const before = await restGet(api, adminToken, `/pending_staff_matches?id=in.(${matchIds.join(",")})&select=status`);
      expect(before.every((r: any) => r.status === "pending")).toBe(true);

      await dialog.getByRole("button", { name: /Confirm approve/i }).click();

      // Wait for the success toast (sonner)
      await expect(page.getByText(/Approved 4 records/i)).toBeVisible();

      // Verify DB state
      const after = await restGet(
        api,
        adminToken,
        `/pending_staff_matches?id=in.(${matchIds.join(",")})&select=id,status,resolved_by,resolved_at`,
      );
      expect(after).toHaveLength(4);
      for (const row of after) {
        expect(row.status).toBe("approved");
        expect(row.resolved_at).not.toBeNull();
        expect(row.resolved_by).not.toBeNull();
      }

      const updatedProfiles = await restGet(
        api,
        adminToken,
        `/profiles?id=in.(${profileIds.join(",")})&select=id,login_enabled`,
      );
      expect(updatedProfiles).toHaveLength(4);
      for (const p of updatedProfiles) expect(p.login_enabled).toBe(true);
    } finally {
      await cleanupSeed(api, adminToken, matchIds, profileIds);
    }
  });

  test("bulk delete removes profiles and marks every match rejected", async ({ page }) => {
    const tag = `DEL${Date.now()}`;
    const seeded = await seedPending(api, adminToken, tag, importId, 3);
    const matchIds = seeded.map((r) => r.id);
    const profileIds = seeded.map((r) => r.created_profile_id);

    try {
      await gotoAsAdmin(page, "/staff-approvals/pending");
      await expect(page.getByText(seeded[0].name_text)).toBeVisible();

      await selectSeededRows(page, seeded.map((r) => r.name_text));

      await bulkBar(page).getByRole("button", { name: /^Delete$/ }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(/Reject 3 records\?/i);

      // Confirm — destructive flow
      await dialog.getByRole("button", { name: /Confirm delete/i }).click();
      await expect(page.getByText(/Rejected 3 records/i)).toBeVisible();

      // pending_staff_matches stay (status flipped), profiles are gone
      const after = await restGet(
        api,
        adminToken,
        `/pending_staff_matches?id=in.(${matchIds.join(",")})&select=id,status,resolved_by`,
      );
      expect(after).toHaveLength(3);
      for (const row of after) {
        expect(row.status).toBe("rejected");
        expect(row.resolved_by).not.toBeNull();
      }

      const profilesAfter = await restGet(
        api,
        adminToken,
        `/profiles?id=in.(${profileIds.join(",")})&select=id`,
      );
      expect(profilesAfter).toHaveLength(0);
    } finally {
      // Only matches remain to clean (profiles already deleted by the flow)
      await cleanupSeed(api, adminToken, matchIds, []);
    }
  });

  test("bulk merge with multiple rows is blocked and does not mutate the database", async ({ page }) => {
    const tag = `MRG${Date.now()}`;
    const seeded = await seedPending(api, adminToken, tag, importId, 2);
    const matchIds = seeded.map((r) => r.id);
    const profileIds = seeded.map((r) => r.created_profile_id);

    try {
      await gotoAsAdmin(page, "/staff-approvals/pending");
      await expect(page.getByText(seeded[0].name_text)).toBeVisible();

      await selectSeededRows(page, seeded.map((r) => r.name_text));
      await bulkBar(page).getByRole("button", { name: /^Merge$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(/bulk merge requires a single target profile/i);
      // Only Cancel is offered — no confirm action that could mutate
      await expect(dialog.getByRole("button", { name: /Confirm/i })).toHaveCount(0);
      await dialog.getByRole("button", { name: /Cancel/i }).click();

      // Nothing should have changed
      const after = await restGet(
        api,
        adminToken,
        `/pending_staff_matches?id=in.(${matchIds.join(",")})&select=id,status`,
      );
      expect(after.every((r: any) => r.status === "pending")).toBe(true);

      const profilesAfter = await restGet(
        api,
        adminToken,
        `/profiles?id=in.(${profileIds.join(",")})&select=id,login_enabled`,
      );
      expect(profilesAfter).toHaveLength(2);
      for (const p of profilesAfter) expect(p.login_enabled).toBe(false);
    } finally {
      await cleanupSeed(api, adminToken, matchIds, profileIds);
    }
  });
});
