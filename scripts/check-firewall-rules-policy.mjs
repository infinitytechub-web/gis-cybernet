#!/usr/bin/env node
/**
 * CI guard: ensure RLS policies on public.firewall_rules never expose
 * detection patterns to non-command-tier roles.
 *
 * Rules enforced by scanning every supabase/migrations/*.sql file:
 *   1. Any CREATE POLICY ... ON [public.]firewall_rules FOR SELECT (or ALL)
 *      MUST reference has_role(..., 'admin') in its USING clause.
 *   2. Disallow USING (is_enabled = ...) or USING (true) on firewall_rules.
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

const policyRe =
  /CREATE\s+POLICY[\s\S]*?ON\s+(?:public\.)?firewall_rules[\s\S]*?(?:;)/gi;

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  const lines = sql.split("\n");
  let m;
  policyRe.lastIndex = 0;
  while ((m = policyRe.exec(sql)) !== null) {
    const stmt = m[0];
    const startLine = sql.slice(0, m.index).split("\n").length;
    const isWriteOnly = /\bFOR\s+(INSERT|UPDATE|DELETE)\b/i.test(stmt);
    if (isWriteOnly) continue; // write-only policies are not the concern here

    const requiresAdmin = /has_role\s*\([^)]*'admin'/i.test(stmt);
    const permissive =
      /USING\s*\(\s*true\s*\)/i.test(stmt) ||
      /USING\s*\(\s*is_enabled\b/i.test(stmt);

    if (permissive || !requiresAdmin) {
      failed++;
      console.error(
        `::error file=${file},line=${startLine}::firewall_rules policy must restrict reads to command tier (has_role(...,'admin') or oic/2ic). Permissive or role-less USING clause detected.`
      );
      // Echo the offending statement to logs for context.
      const snippet = lines.slice(startLine - 1, startLine + 6).join("\n");
      console.error(snippet);
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
