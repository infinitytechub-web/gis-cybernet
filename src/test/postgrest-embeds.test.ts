import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard: `public.user_roles` references `auth.users`, NOT
 * `public.profiles`, so PostgREST cannot embed it on a `profiles` select.
 * Doing so returns HTTP 400 and silently empties staff directory pickers
 * (seen in the detention intake form's Arresting Officer / Statement Approved
 * by fields). Roles must be fetched in a separate `user_roles` query.
 */

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "test" || e.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("PostgREST embed safety", () => {
  it("never embeds user_roles inside a profiles select", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const src = fs.readFileSync(file, "utf8");
      const re = /\.from\(\s*["']profiles["']\s*\)[\s\S]{0,400}?\.select\(\s*(["'`])([\s\S]*?)\1/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (/user_roles\s*\(/.test(m[2])) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${path.relative(SRC, file)}:${line}`);
        }
      }
    }

    expect(
      offenders,
      `profiles→user_roles embed found (PostgREST 400). Query user_roles separately:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
