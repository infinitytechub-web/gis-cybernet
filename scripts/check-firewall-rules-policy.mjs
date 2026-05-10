#!/usr/bin/env node
/**
 * CI guard: ensure RLS policies on public.firewall_rules never expose
 * detection patterns to non-command-tier roles.
 *
 * The script replays every migration in chronological order, tracking the
 * final state of policies on `firewall_rules`. It then enforces:
 *
 *   - Every surviving policy with a USING clause MUST reference `has_role`
 *     and `'admin'` in that USING expression.
 *   - The USING expression MUST NOT be permissive (`true` or
 *     `is_enabled` based).
 *
 * Historical/dropped policies are ignored — only the final effective policy
 * set matters.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = "supabase/migrations";
const TABLE = "firewall_rules";

const files = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join(MIG_DIR, f));

/** key: lowercase policyname  -> { stmt, file, lineNo, name } */
const policies = new Map();

function lineOf(sql, idx) {
  return sql.slice(0, idx).split("\n").length;
}

function strip(name) {
  return name.replace(/^"|"$/g, "").toLowerCase();
}

const tableRe = new RegExp(`(?:public\\.)?${TABLE}\\b`, "i");

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  let cursor = 0;
  for (const raw of sql.split(/;/)) {
    const stmt = raw;
    const stmtStart = cursor;
    cursor += raw.length + 1;

    if (!tableRe.test(stmt)) continue;

    // DROP POLICY ["name"|name] ON [public.]firewall_rules
    const dropM = new RegExp(
      `DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?(\"[^\"]+\"|[A-Za-z0-9_]+)\\s+ON\\s+(?:public\\.)?${TABLE}`,
      "i"
    ).exec(stmt);
    if (dropM) {
      policies.delete(strip(dropM[1]));
      continue;
    }

    // CREATE POLICY "name" ON [public.]firewall_rules ...
    const createM = new RegExp(
      `CREATE\\s+POLICY\\s+(\"[^\"]+\"|[A-Za-z0-9_]+)\\s+ON\\s+(?:public\\.)?${TABLE}\\b`,
      "i"
    ).exec(stmt);
    if (createM) {
      const name = strip(createM[1]);
      const lineNo = lineOf(sql, stmtStart + (createM.index ?? 0));
      policies.set(name, { stmt, file, lineNo, name });
    }
  }
}

let failed = 0;
for (const p of policies.values()) {
  // Only enforce on policies that have a USING clause (read side).
  // Match USING(...) allowing nested parens (single level deep is enough for our DSL).
  const usingMatch = /USING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|TO\s+|;|$)/i.exec(
    p.stmt + ";",
  );
  if (!usingMatch) continue;
  const usingExpr = usingMatch[1];

  const permissive =
    /^\s*true\s*$/i.test(usingExpr.trim()) ||
    /\bis_enabled\b/i.test(usingExpr);
  const requiresAdmin =
    /\bhas_role\b/i.test(usingExpr) && /'admin'/i.test(usingExpr);

  if (permissive || !requiresAdmin) {
    failed++;
    console.error(
      `::error file=${p.file},line=${p.lineNo}::firewall_rules policy "${p.name}" USING clause must require has_role(...,'admin') and must not be permissive (true / is_enabled).`,
    );
    console.error(p.stmt.trim().split("\n").slice(0, 8).join("\n"));
  }
}

if (failed > 0) {
  console.error(
    `\nfirewall_rules policy guard failed: ${failed} offending effective policy(ies).`,
  );
  process.exit(1);
}
console.log(
  `firewall_rules policy guard: OK (${policies.size} effective policy(ies) checked).`,
);
