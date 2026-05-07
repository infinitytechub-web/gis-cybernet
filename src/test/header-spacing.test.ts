import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual-regression guard for branded page headers.
 *
 * Catches "empty subtitle" gaps like a leftover `<p class="text-xs text-white/80"></p>`
 * sitting under an `<h1>` in a gradient header. These render as a phantom line of
 * vertical space because the paragraph still occupies its line-height.
 *
 * If you intentionally need a placeholder element, give it `aria-hidden` AND
 * set explicit zero height (e.g. `h-0 leading-none`) so layout doesn't shift.
 */

const ROOTS = ["src/pages", "src/components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Matches text-bearing tags that are completely empty (no children, no whitespace).
// Allows any attributes. Excludes self-closing tags.
const EMPTY_TEXT_TAG = /<(p|h[1-6]|span|label)\b[^>]*>\s*<\/\1>/g;

// Allow-list: empty spans used purely as visual decorations (e.g. ping dots).
// Match by class signature so the test stays strict but pragmatic.
const ALLOWED_EMPTY = [
  /class(Name)?="[^"]*animate-ping[^"]*"/,
  // Any rounded-full dot/pill is a visual indicator, not a content gap
  /class(Name)?="[^"]*rounded-full[^"]*"/,
  // Inline-styled decorative spans (e.g. map markers) injected as HTML strings
  /style=(["'`])[^"'`]*background[^"'`]*\1/,
  // Wrapper spans whose only child is a self-closed decorative element
  /<span[^>]*>\s*<(span|div|i|svg)\b[^>]*\/>\s*<\/span>/,
];

describe("header spacing — no empty text elements", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("scans at least one page file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} has no empty <p>/<h*>/<span>/<label> tags`, () => {
      const src = readFileSync(file, "utf8");
      const offences: string[] = [];
      for (const match of src.matchAll(EMPTY_TEXT_TAG)) {
        const snippet = match[0];
        if (ALLOWED_EMPTY.some((re) => re.test(snippet))) continue;
        const lineNo = src.slice(0, match.index ?? 0).split("\n").length;
        offences.push(`  line ${lineNo}: ${snippet}`);
      }
      if (offences.length) {
        throw new Error(
          `Found empty text element(s) that may create header/spacing gaps:\n${offences.join(
            "\n",
          )}\n\nRemove the element, or add a decorative class allow-listed in header-spacing.test.ts.`,
        );
      }
    });
  }
});
