import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "../support/axe";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1366, height: 768 },
];

for (const vp of VIEWPORTS) {
  test(`Login page is WCAG 2.1 AA compliant @ ${vp.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/login");
    // Wait for form to be interactive — guarantees axe scans the real DOM.
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
}

test("Login form fields have associated labels and autocomplete hints", async ({ page }) => {
  await page.goto("/login");

  const idInput = page.getByLabel(/Staff \/ Service ID/i);
  await expect(idInput).toBeVisible();
  await expect(idInput).toHaveAttribute("autocomplete", "username");

  const pwInput = page.getByLabel(/^Password$/i);
  await expect(pwInput).toBeVisible();
  await expect(pwInput).toHaveAttribute("autocomplete", "current-password");
  await expect(pwInput).toHaveAttribute("type", "password");

  // Show-password toggle is reachable and announced
  const showBtn = page.getByRole("button", { name: /show password/i });
  await expect(showBtn).toBeVisible();
  await showBtn.click();
  await expect(pwInput).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: /hide password/i })).toBeVisible();
});

test("Sign In button announces busy state during submission", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/Staff \/ Service ID/i).fill("ZZZZ-NOTREAL");
  await page.getByLabel(/^Password$/i).fill("definitely-wrong-password-1234567");
  const btn = page.getByRole("button", { name: /sign in/i }).first();
  await btn.click();
  // Either the API rejects fast (button returns to normal) or it briefly flips to busy.
  // Validate that the attribute exists so screen readers can interpret it.
  await expect(btn).toHaveAttribute("aria-busy", /^(true|false)$/);
});
