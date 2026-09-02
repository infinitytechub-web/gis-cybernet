import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { signInAs } from "../support/auth";

/**
 * M&E thin vertical slice: create objective → program → project, submit each
 * for approval, create/submit a field report, and verify dashboard visibility.
 * The suite is opt-in because it writes authenticated test records.
 */
const BASE_URL = process.env.E2E_BASE_URL;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const skipAll = !BASE_URL || !SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD;
const REST = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "";

test.describe("M&E thin vertical slice", () => {
  test.skip(skipAll, "E2E base URL, backend URL, and admin credentials are required");

  let api: APIRequestContext;
  let token = "";
  const created: Record<string, string[]> = { me_objectives: [], me_programs: [], me_projects: [], me_field_reports: [] };

  async function rest(path: string, method: "GET" | "DELETE" = "GET") {
    const response = await api.fetch(`${REST}${path}`, { method, headers: { apikey: ANON_KEY!, Authorization: `Bearer ${token}` } });
    if (!response.ok()) throw new Error(`${method} ${path} failed: ${response.status()} ${await response.text()}`);
    return response.json();
  }

  test.beforeAll(async () => {
    if (skipAll) return;
    const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON_KEY!, "content-type": "application/json" }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
    if (!signIn.ok) throw new Error(`Admin sign-in failed: ${signIn.status()}`);
    token = (await signIn.json()).access_token as string;
    api = await pwRequest.newContext();
  });

  test.afterAll(async () => {
    if (skipAll) return;
    for (const table of ["me_field_reports", "me_projects", "me_programs", "me_objectives"]) {
      const ids = created[table];
      if (ids.length) await rest(`/${table}?id=in.(${ids.join(",")})`, "DELETE");
    }
    await api.dispose();
  });

  test("creates, submits, and surfaces the complete workflow", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto(`${BASE_URL}/me/objectives`);

    const suffix = `E2E-${Date.now()}`;
    async function createRecord(path: string, singular: string, fields: Record<string, string>) {
      await page.goto(`${BASE_URL}${path}`);
      await page.getByRole("button", { name: `New ${singular}` }).click();
      for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByRole("button", { name: "Create record" }).click();
      await expect(page.getByText(`${singular} created`)).toBeVisible();
    }

    await createRecord("/me/objectives", "Objective", { Reference: `OBJ-${suffix}`, Name: `Objective ${suffix}` });
    const objective = (await rest(`/me_objectives?ref_code=eq.OBJ-${suffix}&select=id,status`))[0] as { id: string; status: string };
    created.me_objectives.push(objective.id);
    expect(objective.status).toBe("draft");
    await page.getByRole("row", { name: new RegExp(`OBJ-${suffix}`) }).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Objective submitted for approval")).toBeVisible();

    await createRecord("/me/programs", "Program", { Reference: `PRG-${suffix}`, Name: `Program ${suffix}` });
    const program = (await rest(`/me_programs?ref_code=eq.PRG-${suffix}&select=id,status`))[0] as { id: string; status: string };
    created.me_programs.push(program.id);
    await page.getByRole("row", { name: new RegExp(`PRG-${suffix}`) }).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Program submitted for approval")).toBeVisible();

    await createRecord("/me/projects", "Project", { Reference: `PJT-${suffix}`, Name: `Project ${suffix}` });
    const project = (await rest(`/me_projects?ref_code=eq.PJT-${suffix}&select=id,status`))[0] as { id: string; status: string };
    created.me_projects.push(project.id);
    await page.getByRole("row", { name: new RegExp(`PJT-${suffix}`) }).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Project submitted for approval")).toBeVisible();

    await createRecord("/me/field-reports", "Field Report", { Reference: `RPT-${suffix}`, Title: `Field report ${suffix}`, Summary: "E2E field verification" });
    const report = (await rest(`/me_field_reports?ref_code=eq.RPT-${suffix}&select=id,status`))[0] as { id: string; status: string };
    created.me_field_reports.push(report.id);
    await page.getByRole("row", { name: new RegExp(`RPT-${suffix}`) }).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Field Report submitted")).toBeVisible();

    const statuses = await Promise.all([
      rest(`/me_objectives?id=eq.${objective.id}&select=status`),
      rest(`/me_programs?id=eq.${program.id}&select=status`),
      rest(`/me_projects?id=eq.${project.id}&select=status`),
      rest(`/me_field_reports?id=eq.${report.id}&select=status`),
    ]);
    expect(statuses[0][0].status).toBe("submitted");
    expect(statuses[1][0].status).toBe("submitted");
    expect(statuses[2][0].status).toBe("submitted");
    expect(statuses[3][0].status).toBe("submitted");

    await page.goto(`${BASE_URL}/me/command-center`);
    await expect(page.getByRole("heading", { name: "M&E Command Center" })).toBeVisible();
    await expect(page.getByText(`Field report ${suffix}`)).toBeVisible();
  });
});
