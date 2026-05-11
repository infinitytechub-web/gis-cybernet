import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config used by `npm run test:e2e`. Runs vite preview
 * against the production build, then drives @axe-core/playwright + functional
 * specs across the key user journeys.
 *
 * Use the existing `playwright.config.ts` (lovable agent fixture) for in-IDE
 * snapshot tests; this config is dedicated to CI accessibility + e2e checks.
 */
export default defineConfig({
  testDir: "./tests",
  // Header-snapshot spec uses the lovable fixture which only resolves inside
  // the agent runtime — exclude it from the standalone runner.
  testIgnore: ["**/header-snapshots.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop",   use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome",    use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
