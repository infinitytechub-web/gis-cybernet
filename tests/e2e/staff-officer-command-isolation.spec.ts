import { expect, test } from "@playwright/test";
import {
  bootAs,
  collectConsoleErrors,
  env,
  requireStaffOfficerCreds,
  restRpc,
  restSelect,
  significantErrors,
} from "../smoke/support/smoke";

test.describe("Staff Officer command isolation", () => {
  test.beforeEach(() => requireStaffOfficerCreds());

  test("UI denies every unassigned restricted module", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await bootAs(page, "staff_officer");

    for (const path of ["/hr", "/staff", "/command-analytics", "/command-vault", "/org-structure"]) {
      await page.goto(path);
      await expect(page.getByText(/access denied|do not have permission/i).first()).toBeVisible();
    }
    expect(significantErrors(errors)).toEqual([]);
  });

  test("API withholds another command's HR records, analytics, documents, and structure", async ({ page }) => {
    const session = await bootAs(page, "staff_officer");
    const otherUnit = env.staffOfficerOtherUnitId ?? "";

    const [profiles, documents, positions, analytics] = await Promise.all([
      restSelect("profiles", session.access_token, `select=id&org_unit_id=eq.${encodeURIComponent(otherUnit)}&limit=1`),
      restSelect("staff_documents", session.access_token, `select=id,profiles!inner(org_unit_id)&profiles.org_unit_id=eq.${encodeURIComponent(otherUnit)}&limit=1`),
      restSelect("org_positions", session.access_token, `select=id&org_unit_id=eq.${encodeURIComponent(otherUnit)}&limit=1`),
      restRpc("staff_analytics", session.access_token, { _org_unit_id: otherUnit }),
    ]);

    for (const result of [profiles, documents, positions]) {
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toEqual([]);
    }
    expect(analytics.status).toBeGreaterThanOrEqual(400);
  });

  test("API still permits the officer's own record", async ({ page }) => {
    const session = await bootAs(page, "staff_officer");
    const result = await restSelect("profiles", session.access_token, `select=id&user_id=eq.${session.user.id}`);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toHaveLength(1);
  });
});