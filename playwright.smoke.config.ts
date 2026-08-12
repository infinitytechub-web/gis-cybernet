import { defineConfig, devices } from "@playwright/test";

/**
 * Post-deployment smoke suite.
 *
 * Purpose: a fast, READ-ONLY confidence check that can be pointed at any
 * environment (preview, production, or a local `vite preview` build) right
 * after a deploy. It covers the three areas that break most visibly:
 *   1. auth flows          (tests/smoke/auth.smoke.spec.ts)
 *   2. map tile failover   (tests/smoke/map-failover.smoke.spec.ts)
 *   3. permission checks   (tests/smoke/permissions.smoke.spec.ts)
 *
 * Run:  npm run test:smoke                 (E2E_BASE_URL or local preview)
 *       npm run test:smoke:prod            (published URL)
 *
 * The suite never creates, edits, or deletes records, so it is safe against
 * production. Checks whose credentials are missing skip with a clear reason.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: /.*\.smoke\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never", outputFolder: "playwright-report-smoke" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report-smoke" }]],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "smoke-chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only spin up a local preview when no deployed URL was supplied.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
