import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeCsvValue } from "@/lib/csv-safe";

const source = readFileSync("src/components/settings/BulkCreateAccounts.tsx", "utf8");

describe("bulk staff credentials handling", () => {
  it("offers credentials export only as CSV and Excel", () => {
    expect(source).toContain('formats={["csv", "excel"]}');
  });

  it("locks the export behind administrator verification", () => {
    expect(source).toContain("if (!results?.length || !verified) return null;");
    expect(source).toContain("disabled={!verified}");
  });

  it("masks passwords until explicitly revealed", () => {
    expect(source).toContain("show ? account.password : MASK");
  });

  it("audits generation, reveal, verification and export without password values", () => {
    for (const action of ["generated", "revealed", "verified", "exported"]) {
      expect(source).toContain(`logAdminAudit("staff_credentials", "${action}"`);
    }
    expect(source).not.toMatch(/logAdminAudit\([^)]*password/);
  });

  it("sanitises credential cells that could be read as spreadsheet formulas", () => {
    expect(sanitizeCsvValue("=cmd|'/c calc'!A1")).not.toMatch(/^=/);
    expect(sanitizeCsvValue("+Ab3!xyz")).not.toMatch(/^\+/);
  });
});
