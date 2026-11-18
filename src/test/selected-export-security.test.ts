import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { csvCellQuoted } from "@/lib/csv-safe";

describe("selected attendance and KYC CSV protections", () => {
  it.each([
    "src/components/attendance/AttendanceValidationReport.tsx",
    "src/components/hr/KycExportDialog.tsx",
  ])("routes every header and data cell through the safe serializer: %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain('import { csvCellQuoted } from "@/lib/csv-safe"');
    expect(source).toContain("r.map(csvCellQuoted)");
  });

  it.each(["=HYPERLINK(\"bad\")", "+cmd", "-cmd", "@SUM(A1)", "\tformula", "\rformula"])("neutralizes %j", (value) => {
    expect(csvCellQuoted(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
  });

  it("preserves ordinary values, empty cells, quotes and multiline text", () => {
    expect(csvCellQuoted(null)).toBe('""');
    expect(csvCellQuoted(12)).toBe('"12"');
    expect(csvCellQuoted('Command "A",\nSector')).toBe('"Command ""A"",\nSector"');
  });
});