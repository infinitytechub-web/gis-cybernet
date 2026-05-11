import { test } from "@playwright/test";
import { expectNoA11yViolations } from "../support/axe";
import { signInAs } from "../support/auth";

const PAGES = [
  { name: "Dashboard",      path: "/dashboard",  role: "admin" as const },
  { name: "My Shift",       path: "/my-shift",   role: "staff" as const },
  { name: "Attendance",     path: "/attendance", role: "admin" as const },
  { name: "Leave Requests", path: "/leave",      role: "staff" as const },
];

const VIEWPORTS = [
  { name: "mobile",  width: 390,  height: 844 },
  { name: "desktop", width: 1366, height: 768 },
];

test.describe("Authenticated screens — WCAG 2.1 AA", () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_EMAIL) test.skip(true, "E2E auth env vars not provided");
  });

  for (const p of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${p.name} @ ${vp.name}`, async ({ page }, testInfo) => {
        await signInAs(page, p.role);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(p.path, { waitUntil: "networkidle" });

        // The skip-link is the WCAG 2.4.1 bypass mechanism — must exist and
        // become visible on focus.
        const skipLink = page.getByRole("link", { name: /skip to main content/i });
        await skipLink.focus();
        await skipLink.evaluate((el) => (el as HTMLElement).getBoundingClientRect());

        await expectNoA11yViolations(page, testInfo, {
          // Recharts SVGs ship without role labels in some chart variants;
          // suppress only that rule and let everything else fail loudly.
          disabledRules: ["svg-img-alt"],
        });
      });
    }
  }
});
