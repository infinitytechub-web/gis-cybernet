#!/usr/bin/env node
/**
 * CI guard: ensure RLS policies on public.firewall_rules never expose
 * detection patterns to non-command-tier roles.
 *
 * Rules enforced by scanning every supabase/migrations/*.sql file:
 *   - Any CREATE POLICY ... ON [public.]firewall_rules with a USING clause
 *     (SELECT or ALL) MUST reference has_role(..., 'admin') in that USING.
 *   - Disallow USING (is_enabled ...) or USING (true) on firewall_rules.
 *
 * Fails the build with ::error file= annotations on the offending lines.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = "supabase/migrations";
let failed = 0;

const files = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => join(MIG_DIR, f));

function lineOf(sql, idx) {
  return sql.slice(0, idx).split("\n").length;
}

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  // Split on semicolons that end a statement (rough but adequate for migrations).
  let cursor = 0;
  for (const raw of sql.split(/;/)) {
    const stmt = raw;
    const stmtStart = cursor;
    cursor += raw.length + 1; // +1 for the consumed semicolon

    // Only inspect CREATE POLICY ... ON ... firewall_rules statements.
    if (!/CREATE\s+POLICY\b/i.test(stmt)) continue;
    if (!/ON\s+(?:public\.)?firewall_rules\b/i.test(stmt)) continue;

    // Only enforce on policies with a USING clause (read side).
    const usingMatch = /USING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|$)/i.exec(stmt);
    if (!usingMatch) continue;
    const usingExpr = usingMatch[1];

    const permissive =
      /^\s*true\s*$/i.test(usingExpr) || /\bis_enabled\b/i.test(usingExpr);
    const requiresAdmin = /has_role\s*\([^)]*'admin'/i.test(usingExpr);

    if (permissive || !requiresAdmin) {
      failed++;
      const lineNo = lineOf(sql, stmtStart + stmt.search(/CREATE\s+POLICY/i));
      console.error(
        `::error file=${file},line=${lineNo}::firewall_rules policy USING clause must require has_role(...,'admin') and must not be permissive (true / is_enabled).`
      );
      console.error(stmt.trim().split("\n").slice(0, 8).join("\n"));
    }
  }
}

if (failed > 0) {
  console.error(
    `\nfirewall_rules policy guard failed: ${failed} offending policy statement(s) found.`
  );
  process.exit(1);
}
console.log("firewall_rules policy guard: OK");
