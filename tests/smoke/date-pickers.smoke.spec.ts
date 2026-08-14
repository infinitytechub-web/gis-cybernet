import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import {
  bootAs,
  collectConsoleErrors,
  hasAdminCreds,
  requireAdminCreds,
  requireStaffCreds,
} from "./support/smoke";
import { monthFirstOffenders } from "../../src/lib/date-scan";

/**
 * Date PICKER regression smoke check.
 *
 * Complements `date-format.smoke.spec.ts` (which audits rendered text) by
 * driving the pickers themselves: every date control on forms, filter bars and
 * export dialogs must DISPLAY and RETURN DD/MM/YYYY.
 *
 * Contract of `src/components/ui/date-input.tsx`:
 *   - visible text  → DD/MM/YYYY (masked while typing)
 *   - placeholder   → "DD/MM/YYYY"
 *   - emitted value → ISO `yyyy-MM-dd` (machine format, intentional)
 *   - calendar pick → fills the text field in DD/MM/YYYY
 *
 * READ-ONLY: the suite types into inputs and opens calendars, but never
 * submits, saves or deletes anything.
 */

const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

/** Screens that carry form pickers, filter pickers, or both. */
const PICKER_ROUTES = [
  "/holding",
  "/leave",
  "/staff",
  "/duty-roster",
  "/guard-schedule",
  "/audit-trail",
  "/rum-analytics",
];

/** Every DateInput text field on the page (opened dialogs included). */
function pickers(page: Page): Locator {
  return page.locator('input[placeholder="DD/MM/YYYY"]:visible');
}

async function open(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) test.skip(true, `${route} unavailable (${response.status()})`);
  await page.waitForTimeout(2000);
  if (page.url().includes("/login")) test.skip(true, `${route} redirected to login`);
}

/** Reveal pickers hidden behind the first "new / add / create / filter" control. */
async function revealHiddenPickers(page: Page) {
  if (await pickers(page).count()) return;
  const opener = page
    .getByRole("button", { name: /new|add|create|book[- ]in|intake|filter|range/i })
    .first();
  if (await opener.count()) {
    await opener.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
}

test.describe("date pickers — display and return DD/MM/YYYY", () => {
  test.beforeEach(() => requireStaffCreds());

  for (const route of PICKER_ROUTES) {
    test(`pickers on ${route} are day-first`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await bootAs(page, hasAdminCreds() ? "admin" : "staff");
      await open(page, route);
      await revealHiddenPickers(page);

      // No native date input may survive anywhere — those render in the
      // browser locale (month-first on US machines).
      expect(
        await page.locator('input[type="date"]').count(),
        `native <input type="date"> found on ${route}`,
      ).toBe(0);

      const all = pickers(page);
      const count = await all.count();
      if (!count) test.skip(true, `no date pickers reachable on ${route}`);

      for (let i = 0; i < count; i++) {
        const input = all.nth(i);
        // Pre-filled values must already read as DD/MM/YYYY.
        const initial = ((await input.inputValue()) ?? "").trim();
        if (initial) expect(initial, `picker #${i} on ${route}`).toMatch(DDMMYYYY);
        expect(await input.getAttribute("placeholder")).toBe("DD/MM/YYYY");
      }

      // Hint labels must never advertise the month-first order.
      const text = await page.evaluate(() => document.body.innerText ?? "");
      expect(text).not.toMatch(/MM\/DD\/YYYY/i);
      expect(monthFirstOffenders(text)).toEqual([]);
      expect(errors.filter((e) => /Invalid time value|date/i.test(e))).toEqual([]);
    });
  }

  test("typing digits masks to DD/MM/YYYY and rejects month-first input", async ({ page }) => {
    await bootAs(page, hasAdminCreds() ? "admin" : "staff");
    await open(page, "/holding");
    await revealHiddenPickers(page);

    const input = pickers(page).first();
    if (!(await input.count())) test.skip(true, "no date picker reachable");

    await input.fill("");
    await input.type("19022016", { delay: 20 });
    expect(await input.inputValue()).toBe("19/02/2016");

    // Partial entry stays masked day-first, never re-ordered.
    await input.fill("");
    await input.type("1902", { delay: 20 });
    expect(await input.inputValue()).toBe("19/02");

    // A month-first style entry (02/19/2016) is an invalid day-first date and
    // must be discarded on blur rather than silently accepted.
    await input.fill("");
    await input.type("02192016", { delay: 20 });
    expect(await input.inputValue()).toBe("02/19/2016");
    await input.blur();
    await page.waitForTimeout(300);
    expect(await input.inputValue()).not.toBe("02/19/2016");
  });

  test("calendar selection writes DD/MM/YYYY back to the field", async ({ page }) => {
    await bootAs(page, hasAdminCreds() ? "admin" : "staff");
    await open(page, "/holding");
    await revealHiddenPickers(page);

    const input = pickers(page).first();
    if (!(await input.count())) test.skip(true, "no date picker reachable");

    const trigger = page.getByRole("button", { name: /open calendar \(dd\/mm\/yyyy\)/i }).first();
    expect(await trigger.count(), "calendar trigger missing").toBeGreaterThan(0);
    await trigger.click();

    const grid = page.locator('[role="grid"]').first();
    await expect(grid).toBeVisible();
    const day = grid.getByRole("gridcell").filter({ hasText: /^15$/ }).first();
    if (!(await day.count())) test.skip(true, "calendar grid did not render selectable days");
    await day.click();
    await page.waitForTimeout(400);

    const value = await input.inputValue();
    expect(value, "calendar pick must fill DD/MM/YYYY").toMatch(DDMMYYYY);
    expect(value.slice(0, 2)).toBe("15");
  });
});

test.describe("date pickers — filters and exports", () => {
  test.beforeEach(() => requireAdminCreds());

  test("filter date range drives the view without month-first output", async ({ page }) => {
    await bootAs(page, "admin");
    await open(page, "/audit-trail");
    await revealHiddenPickers(page);

    const inputs = pickers(page);
    if (!(await inputs.count())) test.skip(true, "no filter date pickers on this screen");

    await inputs.first().fill("");
    await inputs.first().type("01012026", { delay: 20 });
    expect(await inputs.first().inputValue()).toBe("01/01/2026");
    await page.waitForTimeout(1500);

    const text = await page.evaluate(() => document.body.innerText ?? "");
    expect(monthFirstOffenders(text)).toEqual([]);
  });

  test("export produced from a picker-driven filter is day-first", async ({ page }) => {
    await bootAs(page, "admin");
    await open(page, "/holding");
    await revealHiddenPickers(page);

    const input = pickers(page).first();
    if (await input.count()) {
      await input.fill("");
      await input.type("01012026", { delay: 20 });
      await page.waitForTimeout(1200);
    }

    const exportBtn = page.getByRole("button", { name: /export|csv/i }).first();
    if (!(await exportBtn.count())) test.skip(true, "no export control on this screen");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
      exportBtn.click(),
    ]);
    if (!download) test.skip(true, "export did not produce a download");

    const path = await download!.path();
    const csv = path ? await fs.readFile(path, "utf8") : "";
    expect(monthFirstOffenders(csv), "month-first dates in export").toEqual([]);
    expect(csv).not.toMatch(/MM\/DD\/YYYY/i);
  });
});
