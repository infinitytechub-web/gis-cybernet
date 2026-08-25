import { describe, it, expect } from "vitest";
import { csvCell, csvCellQuoted, sanitizeCsvValue } from "@/lib/csv-safe";
describe("csv-safe", () => {
  it("neutralises formulas", () => {
    expect(sanitizeCsvValue("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvCell("+1,2")).toBe('"\'+1,2"');
    expect(csvCellQuoted("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell(null)).toBe("");
  });
});
