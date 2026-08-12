import { test, expect } from "@playwright/test";
import {
  bootAs, callFunction, env, requireAdminCreds, requireStaffCreds,
  restSelect, signInWithPassword,
} from "./support/smoke";

/**
 * PERMISSION SMOKE — read-only.
 *
 * Verifies both layers of enforcement:
 *   • UI gating   — command-only routes deny a plain staff account and the
 *                   privileged nav entries are absent from the sidebar.
 *   • Server-side — RLS blocks restricted table reads and a privileged edge
 *                   function rejects a staff token, so the UI is not the only
 *                   thing standing between staff and admin data.
 *
 * No mutation is ever attempted: the edge-function probe targets a
 * non-existent user id and is expected to be refused before any work happens.
 */

/** Routes that must be denied to a non-privileged staff account. */
const COMMAND_ONLY_ROUTES = ["/admin", "/command-roles"];

/** Tables whose policies restrict reads to command tier / admins. */
const RESTRICTED_TABLES = ["security_audit_log", "firewall_settings", "user_roles"];

test.describe("smoke: permission checks (UI)", () => {
  test("staff account is denied on command-only routes", async ({ page }) => {
    requireStaffCreds();
    await bootAs(page, "staff");

    for (const route of COMMAND_ONLY_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#main-content, main", { timeout: 20_000 });

      const denied = page.getByText(/not authorized|not authorised|restricted|access denied/i).first();
      const redirected = !/^\/(admin|command-roles)/.test(new URL(page.url()).pathname);
      const isDenied = redirected || (await denied.isVisible({ timeout: 8_000 }).catch(() => false));
      expect(isDenied, `${route} should be denied for a staff account`).toBeTruthy();

      // The capability panel / grant management UI must never render for staff.
      await expect(page.getByRole("heading", { name: /capability check/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /grant capability|assign command/i })).toHaveCount(0);
    }
  });

  test("admin-only navigation entries are absent for staff", async ({ page }) => {
    requireStaffCreds();
    await bootAs(page, "staff");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#main-content, main", { timeout: 20_000 });

    const nav = page.getByRole("navigation").first();
    for (const label of [/admin console/i, /command roles/i, /sensitive access log/i]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

  test("admin account can open the command-only routes", async ({ page }) => {
    requireAdminCreds();
    await bootAs(page, "admin");

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#main-content, main", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /admin console/i }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/not authorized|not authorised/i)).toHaveCount(0);

    await page.goto("/command-roles", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#main-content, main", { timeout: 20_000 });
    await expect(page.getByText(/not authorized|not authorised/i)).toHaveCount(0);
  });
});

test.describe("smoke: permission checks (server-side)", () => {
  test("restricted tables return no data for a staff token", async () => {
    requireStaffCreds();
    const session = await signInWithPassword(env.staffEmail!, env.staffPassword!);
    expect(session, "staff sign-in should succeed").not.toBeNull();

    for (const table of RESTRICTED_TABLES) {
      const { status, body } = await restSelect(table, session!.access_token);
      const blocked =
        status === 401 || status === 403 || status === 404 ||
        (status === 200 && (body.trim() === "[]" || isOwnRowsOnly(table, body, session!.user.id)));
      expect(blocked, `${table} leaked data to a staff token (status ${status}): ${body.slice(0, 200)}`).toBeTruthy();
    }
  });

  test("privileged edge function refuses a staff token but accepts an admin token", async ({ baseURL }) => {
    requireStaffCreds();
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const staff = await signInWithPassword(env.staffEmail!, env.staffPassword!);
    expect(staff).not.toBeNull();

    // Non-existent target id — the call must be refused on authority grounds
    // before it can touch any account.
    const probe = { user_id: "00000000-0000-0000-0000-000000000000", dry_run: true };

    const staffCall = await callFunction("admin-reset-password", staff!.access_token, probe, origin);
    expect(
      [401, 403].includes(staffCall.status),
      `staff token should be refused (got ${staffCall.status}): ${staffCall.body.slice(0, 200)}`,
    ).toBeTruthy();

    if (!env.adminEmail || !env.adminPassword) {
      test.info().annotations.push({ type: "skipped-part", description: "Admin half skipped: E2E_ADMIN_* not set." });
      return;
    }
    const admin = await signInWithPassword(env.adminEmail!, env.adminPassword!);
    expect(admin, "admin sign-in should succeed").not.toBeNull();
    const adminCall = await callFunction("admin-reset-password", admin!.access_token, probe, origin);
    // Authorization passed: anything other than an authority rejection is fine
    // (a 400/404 for the fake user id is the expected happy path here).
    expect(
      ![401, 403].includes(adminCall.status),
      `admin token should pass the authority check (got ${adminCall.status}): ${adminCall.body.slice(0, 200)}`,
    ).toBeTruthy();
  });
});

/**
 * `user_roles` legitimately lets a user read their own role row. Treat that as
 * correctly scoped rather than a leak; any other user's row is a failure.
 */
function isOwnRowsOnly(table: string, body: string, userId: string): boolean {
  if (table !== "user_roles") return false;
  try {
    const rows = JSON.parse(body) as Array<{ user_id?: string }>;
    return rows.every((r) => r.user_id === userId);
  } catch {
    return false;
  }
}
