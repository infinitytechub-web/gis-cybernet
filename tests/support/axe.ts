import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Run an axe-core scan on the current page and assert there are no violations
 * for WCAG 2.1 A & AA. Per-page exclusions can be passed in `disabledRules`
 * (use sparingly — prefer fixing the underlying markup).
 *
 * Results (full HTML target list) are attached to the test report so
 * regressions show up next to the failure rather than as a stack trace.
 */
export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  options: { disabledRules?: string[]; include?: string; exclude?: string[] } = {},
) {
  let builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]);
  if (options.disabledRules?.length) builder = builder.disableRules(options.disabledRules);
  if (options.include) builder = builder.include(options.include);
  for (const sel of options.exclude ?? []) builder = builder.exclude(sel);

  const results = await builder.analyze();

  if (results.violations.length) {
    await testInfo.attach("axe-violations.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }

  expect(
    results.violations,
    `Accessibility violations found:\n${results.violations
      .map((v) => `  • [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n")}`,
  ).toEqual([]);
}
