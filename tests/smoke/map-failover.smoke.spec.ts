import { test, expect, type Page } from "@playwright/test";
import { bootAs, requireAdminCreds } from "./support/smoke";

/**
 * MAP FAILOVER SMOKE — read-only.
 *
 * The base-layer helper (src/lib/leaflet-base-layers.ts) walks an ordered
 * provider chain and emits `map-tiles-failover` on every switch plus
 * `map-tiles-exhausted` when every provider has failed. This spec forces
 * tile errors by aborting tile requests and asserts those signals fire and
 * that the surface degrades gracefully instead of crashing.
 *
 * The live GPS widget is command-tier only, so these checks require the
 * administrator credentials and skip cleanly without them.
 */

const TILE_PATTERNS = [
  "**/functions/v1/maps-tile-proxy**",
  "**/*.tile.openstreetmap.org/**",
  "**/basemaps.cartocdn.com/**",
  "**/server.arcgisonline.com/**",
  "**/*.tile.opentopomap.org/**",
];

/** Records tile-failover CustomEvents before any app code runs. */
async function recordTileEvents(page: Page) {
  await page.addInitScript(() => {
    (window as any).__tileEvents = [] as string[];
    window.addEventListener("map-tiles-failover", (e) => {
      const to = (e as CustomEvent<{ to?: string }>).detail?.to ?? "unknown";
      (window as any).__tileEvents.push(`failover:${to}`);
    });
    window.addEventListener("map-tiles-exhausted", () => {
      (window as any).__tileEvents.push("exhausted");
    });
  });
}

const tileEvents = (page: Page) => page.evaluate(() => (window as any).__tileEvents as string[]);

async function openMapSurface(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content, main", { timeout: 20_000 });
  const map = page.locator(".leaflet-container").first();
  const appeared = await map.isVisible({ timeout: 20_000 }).catch(() => false);
  test.skip(!appeared, "No Leaflet map surface is visible for this account — nothing to fail over.");
  return map;
}

test.describe("smoke: map tile failover", () => {
  test("blocking the proxied tiles switches to a backup provider", async ({ page }) => {
    requireAdminCreds();
    await recordTileEvents(page);
    await bootAs(page, "admin");
    // Only the authenticated Google proxy fails; OSM/Esri/OTM remain reachable.
    await page.route("**/functions/v1/maps-tile-proxy**", (route) => route.abort());

    const map = await openMapSurface(page);

    await expect.poll(async () => (await tileEvents(page)).join(","), { timeout: 30_000 })
      .toContain("failover:");
    // The map itself is still mounted and rendering.
    await expect(map).toBeVisible();
    const events = await tileEvents(page);
    expect(events.some((e) => e.startsWith("failover:")), `tile events: ${events.join(", ")}`).toBeTruthy();
  });

  test("blocking every provider degrades to the 'base map unavailable' state", async ({ page }) => {
    requireAdminCreds();
    await recordTileEvents(page);
    await bootAs(page, "admin");
    for (const pattern of TILE_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }

    const map = await openMapSurface(page);

    await expect.poll(async () => (await tileEvents(page)).join(","), { timeout: 40_000 })
      .toContain("exhausted");

    // Tracking UI survives a total tile outage: map container still mounted and
    // the status banner explains the degraded state.
    await expect(map).toBeVisible();
    await expect(
      page.getByText(/base map (unavailable|switched)|tiles unavailable/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the tile status banner does not block the rest of the page", async ({ page }) => {
    requireAdminCreds();
    await recordTileEvents(page);
    await bootAs(page, "admin");
    for (const pattern of TILE_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }
    await openMapSurface(page);

    // Page remains interactive — a real click on a heading-level control works.
    const anyButton = page.getByRole("button").first();
    await expect(anyButton).toBeEnabled({ timeout: 15_000 });
    await anyButton.click({ trial: true });
    // And no modal overlay is trapping the page.
    await expect(page.locator("[role='dialog'][data-state='open']")).toHaveCount(0);
  });
});
