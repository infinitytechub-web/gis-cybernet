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

/** Machine-readable ISO formats that must not be converted to DD/MM/YYYY. */
const ISO_PATTERN = /^yyyy-MM(-dd)?([ 'T].*)?$/;
/** Day-first display formats. */
const DAY_FIRST = /^(EEEE, )?dd\/MM(\/yyyy)?( .*)?$/;
/** Patterns that carry no day-of-month token at all (e.g. "MMM yyyy", "HH:mm"). */
const NO_DAY_TOKEN = (p: string) => !/d/.test(p.replace(/'[^']*'/g, ""));

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
        if (ISO_PATTERN.test(pattern) || DAY_FIRST.test(pattern) || NO_DAY_TOKEN(pattern)) continue;
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
