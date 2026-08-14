import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import {
  bootAs,
  collectConsoleErrors,
  hasAdminCreds,
  requireAdminCreds,
  requireStaffCreds,
} from "./support/smoke";

/**
 * Date rendering regression smoke check.
 *
 * House standard: every human-visible date (screens, calendars, DoB fields,
 * CSV exports and printed/PDF views) renders DD/MM/YYYY. This suite is
 * READ-ONLY — it only navigates, exports, and reads rendered text.
 *
 * Detection strategy: pull every `d/m/y`-shaped token out of the rendered text
 * and prove none of them is month-first. A token is provably month-first when
 * its SECOND segment is greater than 12 (e.g. 03/14/2026), or when the first
 * segment is greater than 31.
 */

const DATE_TOKEN = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const SHORT_TOKEN = /\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g;

export function monthFirstOffenders(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(DATE_TOKEN)) {
    const [token, a, b] = [m[0], Number(m[1]), Number(m[2])];
    if (b > 12 || a > 31) bad.push(token);
  }
  for (const m of text.matchAll(SHORT_TOKEN)) {
    const [token, a, b] = [m[0], Number(m[1]), Number(m[2])];
    // Only judge tokens that look like a day/month pair (skip fractions/ratios).
    if (a <= 31 && b > 12 && b <= 31) bad.push(token);
  }
  return [...new Set(bad)];
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText ?? "");
}

/** Routes that render tables, calendars, DoB fields and analytics dates. */
const ROUTES = [
  "/dashboard",
  "/staff",
  "/leave",
  "/holding",
  "/duty-roster",
  "/guard-schedule",
  "/audit-trail",
];

test.describe("date rendering — screens and calendars", () => {
  test.beforeEach(() => requireStaffCreds());

  for (const route of ROUTES) {
    test(`no month-first dates on ${route}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await bootAs(page, hasAdminCreds() ? "admin" : "staff");
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      // A route the account may not reach is not a date-format failure.
      if (response && response.status() >= 400) test.skip(true, `${route} unavailable (${response.status()})`);
      await page.waitForTimeout(2500);
      if (page.url().includes("/login")) test.skip(true, `${route} redirected to login`);

      const text = await visibleText(page);
      const offenders = monthFirstOffenders(text);
      expect(offenders, `Month-first dates on ${route}: ${offenders.join(", ")}`).toEqual([]);
      // Any date shown must be zero-padded day-first, e.g. 09/03/2026.
      const fullDates = [...text.matchAll(DATE_TOKEN)].map((m) => m[0]);
      for (const d of fullDates) expect(d, `Unpadded/short date on ${route}`).toMatch(/^\d{2}\/\d{2}\/(\d{2}|\d{4})$/);
      expect(errors.filter((e) => /date|Invalid time value/i.test(e))).toEqual([]);
    });
  }

  test("date inputs advertise the DD/MM/YYYY standard", async ({ page }) => {
    await bootAs(page, hasAdminCreds() ? "admin" : "staff");
    await page.goto("/holding", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (page.url().includes("/login")) test.skip(true, "route redirected to login");

    const text = await visibleText(page);
    expect(text).not.toMatch(/MM\/DD\/YYYY/i);
    // Native date inputs stay ISO-valued (machine format) — that is intended.
    const isoValues = await page
      .locator('input[type="date"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean));
    for (const v of isoValues) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

test.describe("date rendering — exports and PDFs", () => {
  test.beforeEach(() => requireAdminCreds());

  test("CSV exports contain only day-first dates", async ({ page }) => {
    await bootAs(page, "admin");
    await page.goto("/holding", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (page.url().includes("/login")) test.skip(true, "route redirected to login");

    const exportBtn = page.getByRole("button", { name: /export|csv/i }).first();
    if (!(await exportBtn.count())) test.skip(true, "no export control on this screen");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
      exportBtn.click(),
    ]);
    if (!download) test.skip(true, "export did not produce a download");

    const path = await download!.path();
    const csv = path ? await fs.readFile(path, "utf8") : "";
    const offenders = monthFirstOffenders(csv);
    expect(offenders, `Month-first dates in CSV export: ${offenders.join(", ")}`).toEqual([]);
    expect(csv).not.toMatch(/MM\/DD\/YYYY/i);
  });

  test("printed / PDF views render dates as DD/MM/YYYY", async ({ page }) => {
    await bootAs(page, "admin");
    // Stub print so the run never blocks on a native dialog, and capture the
    // DOM exactly as it is handed to the print/PDF pipeline.
    await page.addInitScript(() => {
      (window as unknown as { __printedHtml?: string }).__printedHtml = undefined;
      window.print = () => {
        (window as unknown as { __printedHtml?: string }).__printedHtml = document.body.innerText;
      };
    });
    await page.goto("/holding", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (page.url().includes("/login")) test.skip(true, "route redirected to login");

    const printBtn = page.getByRole("button", { name: /print/i }).first();
    if (!(await printBtn.count())) test.skip(true, "no print control on this screen");
    await printBtn.click();
    await page.waitForTimeout(2000);

    const printed = await page.evaluate(
      () => (window as unknown as { __printedHtml?: string }).__printedHtml ?? document.body.innerText,
    );
    const offenders = monthFirstOffenders(printed ?? "");
    expect(offenders, `Month-first dates in print view: ${offenders.join(", ")}`).toEqual([]);
  });
});
