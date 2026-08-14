import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Repo-wide regression guard: every human-visible date in the app (screens,
 * printed/PDF views and CSV exports) must render as DD/MM/YYYY.
 *
 * Machine-facing values stay ISO (`yyyy-MM-dd`, timestamps) and are allowed.
 */

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);
const rel = (f: string) => path.relative(SRC, f);

/** ISO / filename-safe machine formats always start with the year. */
const YEAR_FIRST = /^yyyy/;

/**
 * A display pattern is day-first when it either has no day-of-month token or
 * places the day token before the month token (dd/MM, dd MMM, EEE, dd/MM/yyyy).
 */
function isDayFirst(pattern: string): boolean {
  const bare = pattern.replace(/'[^']*'/g, "");
  const day = bare.indexOf("d");
  const month = bare.indexOf("M");
  if (day === -1 || month === -1) return true;
  return day < month;
}

describe("date display consistency", () => {
  it("scans a meaningful number of source files", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("uses only DD/MM-first (or ISO/machine) date-fns format patterns", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      const re = /\bformat(?:InTimeZone)?\s*\([^,]+,\s*"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const pattern = m[1];
        if (YEAR_FIRST.test(pattern) || isDayFirst(pattern)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel(file)}:${line} → "${pattern}"`);
      }
    }

    expect(offenders, `Non DD/MM date formats found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("does not use locale-dependent toLocaleDateString for full dates", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      const re = /toLocaleDateString\s*\(([^)]*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const args = m[1];
        // Month/year-only labels (chart axes) are not full dates and are fine.
        const monthOnly = /month:/.test(args) && !/day:/.test(args);
        if (monthOnly) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel(file)}:${line} → toLocaleDateString(${args.trim()})`);
      }
    }

    expect(
      offenders,
      `Locale-dependent date rendering found (use formatDate from @/lib/date-format):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });


  it("does not use locale-dependent toLocaleString for date-times", () => {
    const offenders: string[] = [];
    const re = /new Date\([^;]*?\)\.toLocaleString\(/g;
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel(file)}:${line}`);
      }
    }
    expect(
      offenders,
      `Locale-dependent date-time rendering found (use formatDateTime from @/lib/date-format):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("shows DD/MM/YYYY hints (never MM/DD/YYYY) in date input helper text", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      if (/MM\/DD\/YYYY|mm\/dd\/yyyy/.test(src)) offenders.push(rel(file));
    }
    expect(offenders, `Month-first hints found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps a single source of truth for display formatting", () => {
    const lib = fs.readFileSync(path.join(SRC, "lib/date-format.ts"), "utf8");
    expect(lib).toContain('export const DATE_FORMAT = "dd/MM/yyyy"');
    expect(lib).toContain('export const DATE_TIME_FORMAT = "dd/MM/yyyy HH:mm"');
    expect(lib).toContain('export const DATE_FORMAT_HINT = "DD/MM/YYYY"');
  });
});
