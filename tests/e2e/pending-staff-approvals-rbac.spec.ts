import { test, expect, request as pwRequest, type APIRequestContext, type Page } from "@playwright/test";
import { signInAs } from "../support/auth";

/**
 * RBAC coverage for the bulk-action UI on /staff-approvals/pending.
 *
 *  - Non-admin (staff) users must NOT see the bulk action bar / row checkboxes
 *    and must NOT be able to perform Approve / Delete / Merge via the UI.
 *  - Admin / command-tier users CAN see the bulk bar and (when rows exist)
 *    open the confirmation dialogs.
 *  - In both cases we assert ZERO mutations land in `pending_staff_matches` or
 *    `profiles` for the seeded rows.
 *
 * This is a read-only verification of the gating — destructive write paths are
 * covered by `pending-staff-approvals-bulk.spec.ts` (opt-in via E2E_RUN_DESTRUCTIVE).
 *
 * Required env (CI):
 *   E2E_BASE_URL, E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD     — admin/command-tier user
 *   E2E_TEST_EMAIL,  E2E_TEST_PASSWORD      — non-admin staff user
 *
 * Optional:
 *   E2E_ROSTER_IMPORT_ID                    — attach seeded matches to an
 *                                             existing duty_roster_imports row
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const STAFF_EMAIL = process.env.E2E_TEST_EMAIL;
const STAFF_PASSWORD = process.env.E2E_TEST_PASSWORD;

const skipAll =
  !SUPABASE_URL || !ANON_KEY ||
  !ADMIN_EMAIL || !ADMIN_PASSWORD ||
  !STAFF_EMAIL || !STAFF_PASSWORD;

const REST = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "";

// ------------------------------------------------------------------
// REST helpers (admin JWT for seeding + verification)
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

function headers(token: string, extra: Record<string, string> = {}) {
  return { apikey: ANON_KEY!, Authorization: `Bearer ${token}`, "content-type": "application/json", ...extra };
}

async function restGet(ctx: APIRequestContext, token: string, path: string) {
  const res = await ctx.get(`${REST}${path}`, { headers: headers(token) });
  if (!res.ok()) throw new Error(`GET ${path} failed ${res.status()}: ${await res.text()}`);
  return res.json();
}

async function restPost(ctx: APIRequestContext, token: string, path: string, body: unknown) {
  const res = await ctx.post(`${REST}${path}`, {
    headers: headers(token, { Prefer: "return=representation" }),
    data: body as any,
  });
  if (!res.ok()) throw new Error(`POST ${path} failed ${res.status()}: ${await res.text()}`);
  return res.json();
}

async function restDelete(ctx: APIRequestContext, token: string, path: string) {
  const res = await ctx.delete(`${REST}${path}`, { headers: headers(token) });
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`DELETE ${path} failed ${res.status()}: ${await res.text()}`);
  }
}

// ------------------------------------------------------------------
// Seed/teardown — mirrors the bulk spec's helpers (stub profiles +
// pending_staff_matches under a tag the spec owns end-to-end).
// ------------------------------------------------------------------
interface SeedRow { id: string; created_profile_id: string; name_text: string }

async function seedPending(
  ctx: APIRequestContext,
  token: string,
  tag: string,
  importId: string,
  n: number,
): Promise<SeedRow[]> {
  const profilesPayload = Array.from({ length: n }).map((_, i) => ({
    first_name: `RbacE2E${i}`,
    last_name: tag,
    staff_id: `${tag}-${i}`.toUpperCase().slice(0, 30),
    login_enabled: false,
  }));
  const profiles = (await restPost(ctx, token, "/profiles", profilesPayload)) as Array<{ id: string }>;
  const matchesPayload = profiles.map((p, i) => ({
    import_id: importId,
    rank_text: "Inspector",
    name_text: `Rbac E2E ${tag} ${i}`,
    serial_no: i + 1,
    shift: ["A", "B", "C", "D"][i % 4],
    status: "pending",
    created_profile_id: p.id,
  }));
  return (await restPost(ctx, token, "/pending_staff_matches", matchesPayload)) as SeedRow[];
}

async function cleanupSeed(
  ctx: APIRequestContext,
  token: string,
  matchIds: string[],
  profileIds: string[],
) {
  if (matchIds.length) {
    await restDelete(ctx, token, `/pending_staff_matches?id=in.(${matchIds.map((id) => `"${id}"`).join(",")})`);
  }
  if (profileIds.length) {
    await restDelete(ctx, token, `/profiles?id=in.(${profileIds.map((id) => `"${id}"`).join(",")})`);
  }
}

async function ensureImport(ctx: APIRequestContext, token: string): Promise<{ id: string; created: boolean }> {
  if (process.env.E2E_ROSTER_IMPORT_ID) {
    return { id: process.env.E2E_ROSTER_IMPORT_ID, created: false };
  }
  const rows = (await restPost(ctx, token, "/duty_roster_imports", [{
    period_label: `RbacE2E-${Date.now()}`,
    source_filename: "rbac-e2e.xlsx",
    status: "committed",
  }])) as Array<{ id: string }>;
  return { id: rows[0].id, created: true };
}

async function snapshot(ctx: APIRequestContext, token: string, matchIds: string[], profileIds: string[]) {
  const matches = await restGet(
    ctx, token,
    `/pending_staff_matches?id=in.(${matchIds.join(",")})&select=id,status,resolved_by,resolved_at&order=id`,
  );
  const profiles = await restGet(
    ctx, token,
    `/profiles?id=in.(${profileIds.join(",")})&select=id,login_enabled&order=id`,
  );
  return { matches, profiles };
}

function bulkBar(page: Page) {
  return page.locator("div").filter({ hasText: /^\d+ records? selected/ }).first();
}

// ------------------------------------------------------------------
// Suite
// ------------------------------------------------------------------
test.describe("Pending Staff Approvals — bulk action RBAC", () => {
  test.skip(skipAll, "E2E Supabase + admin/staff credentials required");

  let adminToken: string;
  let api: APIRequestContext;
  let importId: string;
  let importCreated = false;

  // Per-suite seed: same 3 rows shared across both RBAC tests. Cleaned in afterAll.
  let seeded: SeedRow[] = [];

  test.beforeAll(async () => {
    if (skipAll) return;
    adminToken = await getAdminToken();
    api = await pwRequest.newContext();
    const imp = await ensureImport(api, adminToken);
    importId = imp.id;
    importCreated = imp.created;
    seeded = await seedPending(api, adminToken, `RBAC${Date.now()}`, importId, 3);
  });

  test.afterAll(async () => {
    if (skipAll) return;
    await cleanupSeed(api, adminToken, seeded.map((r) => r.id), seeded.map((r) => r.created_profile_id));
    if (importCreated) await restDelete(api, adminToken, `/duty_roster_imports?id=eq.${importId}`);
    await api.dispose();
  });

  test("non-admin staff cannot see bulk controls and cannot mutate via UI", async ({ page }) => {
    const matchIds = seeded.map((r) => r.id);
    const profileIds = seeded.map((r) => r.created_profile_id);
    const before = await snapshot(api, adminToken, matchIds, profileIds);

    await signInAs(page, "staff");
    await page.goto("/staff-approvals/pending");

    // Staff are gated by ProtectedRoute / isAdminOrSupervisor — either the
    // page redirects them away (e.g. to /dashboard or a 403) or it renders
    // without bulk affordances. Either outcome must satisfy: no bulk bar,
    // no row checkboxes for our seeded rows, and zero DB mutations.
    await page.waitForLoadState("networkidle");

    // No bulk bar regardless of which fallback surface they landed on.
    await expect(bulkBar(page)).toHaveCount(0);

    // No per-row "Select <name>" checkbox for any seeded record.
    for (const r of seeded) {
      await expect(page.getByRole("checkbox", { name: `Select ${r.name_text}` })).toHaveCount(0);
    }
    // And no "Select all" affordance from this page either.
    await expect(page.getByRole("checkbox", { name: /^Select all$/i })).toHaveCount(0);

    // Verify DB is byte-for-byte unchanged.
    const after = await snapshot(api, adminToken, matchIds, profileIds);
    expect(after).toEqual(before);
  });

  test("admin sees bulk controls and dialogs are gated (no mutation on Cancel)", async ({ page }) => {
    const matchIds = seeded.map((r) => r.id);
    const profileIds = seeded.map((r) => r.created_profile_id);
    const before = await snapshot(api, adminToken, matchIds, profileIds);

    await signInAs(page, "admin");
    await page.goto("/staff-approvals/pending");
    await expect(page.getByRole("heading", { name: /Pending Staff Approvals/i })).toBeVisible();
    await expect(page.getByText(seeded[0].name_text)).toBeVisible();

    // Select the seeded rows via row checkboxes (admin-only affordance).
    for (const r of seeded) {
      await page.getByRole("checkbox", { name: `Select ${r.name_text}` }).check();
    }
    await expect(bulkBar(page)).toContainText(`${seeded.length} record`);

    // Approve → confirm dialog opens. Cancel — no DB write.
    await bulkBar(page).getByRole("button", { name: /^Approve$/ }).click();
    const approveDialog = page.getByRole("alertdialog");
    await expect(approveDialog).toContainText(new RegExp(`Approve ${seeded.length} records\\?`, "i"));
    await approveDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(approveDialog).toBeHidden();

    // Delete → confirm dialog opens. Cancel — no DB write.
    await bulkBar(page).getByRole("button", { name: /^Delete$/ }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toContainText(new RegExp(`Reject ${seeded.length} records\\?`, "i"));
    await deleteDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(deleteDialog).toBeHidden();

    // Merge with >1 row → guidance dialog with no Confirm button. Cancel.
    await bulkBar(page).getByRole("button", { name: /^Merge$/ }).click();
    const mergeDialog = page.getByRole("alertdialog");
    await expect(mergeDialog).toContainText(/bulk merge requires a single target profile/i);
    await expect(mergeDialog.getByRole("button", { name: /Confirm/i })).toHaveCount(0);
    await mergeDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(mergeDialog).toBeHidden();

    // DB must be unchanged — every dialog was cancelled, no writes issued.
    const after = await snapshot(api, adminToken, matchIds, profileIds);
    expect(after).toEqual(before);
  });
});
