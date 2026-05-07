import { test, expect } from "../playwright-fixture";

/**
 * Visual-regression: page headers must keep consistent vertical rhythm at
 * mobile, tablet, and desktop breakpoints — and must NOT show empty gaps
 * where a missing subtitle used to live.
 *
 * Snapshots are stored next to this spec under a `__screenshots__` folder
 * (per Playwright defaults). Update with `--update-snapshots`.
 */

const PAGES: Array<{ name: string; path: string }> = [
  { name: "appraisals", path: "/appraisals" },
  { name: "my-profile", path: "/my-profile" },
  { name: "health-lab", path: "/health-lab" },
  { name: "ipse", path: "/ipse" },
];

const BREAKPOINTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1366, height: 768 },
];

for (const page of PAGES) {
  for (const bp of BREAKPOINTS) {
    test(`${page.name} header has no empty gap @ ${bp.name}`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: bp.width, height: bp.height });
      await pw.goto(page.path, { waitUntil: "networkidle" });

      const header = pw.getByTestId("page-header").first();
      await expect(header).toBeVisible();

      // Snapshot strictly the header so layout below doesn't cause flake.
      await expect(header).toHaveScreenshot(`${page.name}-${bp.name}.png`, {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });

      // Numeric assertion: header height is bounded — catches phantom
      // subtitle gaps that would push it past ~110px.
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(120);
      expect(box!.height).toBeGreaterThanOrEqual(70);
    });
  }
}
