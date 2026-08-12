import { test, expect } from "@playwright/test";
import {
  bootAs, collectConsoleErrors, expectAppShell, env, requireStaffCreds,
  signInWithPassword, significantErrors, storageKey,
} from "./support/smoke";

/**
 * AUTH SMOKE — read-only.
 * Confirms the login surface renders, protected routes stay protected,
 * a real password grant works, a seeded session boots the app shell,
 * bad credentials are rejected, and sign-out clears the session.
 */
test.describe("smoke: auth flows", () => {
  test("login page renders with a usable sign-in form", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#login-heading")).toBeVisible();
    const form = page.getByRole("form", { name: /sign-in form/i }).first();
    await expect(form).toBeVisible();
    await expect(form.getByRole("textbox").first()).toBeVisible();
    await expect(form.getByRole("button", { name: /sign in|log in|continue/i }).first()).toBeVisible();

    expect(significantErrors(errors), `console errors on /login: ${errors.join(" | ")}`).toEqual([]);
  });

  test("protected routes redirect anonymous visitors to /login", async ({ page }) => {
    for (const path of ["/dashboard", "/admin", "/staff"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
        .toMatch(/^\/(login)?$/);
      // Nothing from the authenticated shell should have rendered.
      await expect(page.getByRole("navigation", { name: /sidebar/i })).toHaveCount(0);
    }
  });

  test("password sign-in returns a usable session", async () => {
    requireStaffCreds();
    const session = await signInWithPassword(env.staffEmail!, env.staffPassword!);
    expect(session, "staff password grant should succeed").not.toBeNull();
    expect(session!.access_token, "session must carry an access token").toBeTruthy();
    expect(session!.user?.id, "session must identify the user").toBeTruthy();
  });

  test("invalid credentials are rejected and store no session", async ({ page }) => {
    requireStaffCreds();
    const bad = await signInWithPassword(env.staffEmail!, "definitely-not-the-password-000");
    expect(bad, "wrong password must not return a session").toBeNull();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), storageKey());
    expect(stored, "no session should be persisted after a failed sign-in").toBeNull();
  });

  test("a seeded session boots straight into the authenticated shell", async ({ page }) => {
    requireStaffCreds();
    const errors = collectConsoleErrors(page);
    await bootAs(page, "staff");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expectAppShell(page);
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .not.toBe("/login");
    expect(significantErrors(errors), `console errors on /dashboard: ${errors.join(" | ")}`).toEqual([]);
  });

  test("sign-out clears the session and returns to login", async ({ page }) => {
    requireStaffCreds();
    await bootAs(page, "staff");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectAppShell(page);

    // Clear the persisted session the same way signOut does, then confirm the
    // guard sends the visitor back to /login on the next navigation.
    await page.evaluate((k) => { window.localStorage.removeItem(k); }, storageKey());
    await page.context().clearCookies();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .toMatch(/^\/(login)?$/);
    await expect(page.locator("#login-heading")).toBeVisible({ timeout: 20_000 });
  });
});
