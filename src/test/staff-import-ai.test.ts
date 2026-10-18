import { describe, expect, it } from "vitest";
import { buildComparison, idKey, validateFindings, validateRows, type ComparisonRow } from "../../supabase/functions/_shared/import-ai/comparison";

const row: ComparisonRow = { row_no: 1, first_name: "  AMA   AKUA ", last_name: "MENSAH", staff_id_raw: "GIS-001", intake: "19", rank: "Inspector", unit: "Station" };
const staff = [{ id: "profile-1", first_name: "AMA AKUA", last_name: "MENSAH", staff_id: "GIS-001", intake: "19" }];
describe("AI staff import comparison safeguards", () => {
  it("matches names after case and spacing normalization", () => {
    expect(buildComparison([{ ...row, first_name: "ama akua", staff_id_raw: "" }], staff)[0].candidates[0].id).toBe("profile-1");
  });
  it("keeps exact ID candidates with mismatched names for review", () => {
    expect(buildComparison([{ ...row, first_name: "KOFI", last_name: "BOATENG" }], staff)[0].candidates[0].id).toBe("profile-1");
  });
  it("does not use placeholder IDs as identity evidence", () => {
    expect(idKey("xxxxxx")).toBe(""); expect(idKey("N/A")).toBe(""); expect(idKey("000000")).toBe("");
    expect(buildComparison([{ ...row, staff_id_raw: "xxxxxx", first_name: "ZZZZZ", last_name: "YYYYY" }], [{ ...staff[0], staff_id: "xxxxxx" }])[0].candidates).toHaveLength(0);
  });
  it("rejects empty, oversized and duplicate-number inputs", () => {
    expect(() => validateRows([])).toThrow();
    expect(() => validateRows(Array.from({ length: 26 }, (_, i) => ({ ...row, row_no: i + 1 })))).toThrow();
    expect(() => validateRows([row, row])).toThrow();
  });
  it("accepts exactly 25 rows and strips unrelated KYC fields", () => {
    const rows = validateRows(Array.from({ length: 25 }, (_, i) => ({ ...row, row_no: i + 1, ghana_card_number: "secret" })));
    expect(rows).toHaveLength(25); expect(rows[0]).not.toHaveProperty("ghana_card_number");
  });
  it("rejects invented staff references", () => {
    expect(() => validateFindings([{ row_no: 1, candidate_key: "invented", assessment: "likely_duplicate", confidence: "high", reason: "Match" }], buildComparison([row], staff))).toThrow();
  });
  it("rejects incomplete findings and never changes input rows", () => {
    const before = JSON.stringify(row);
    expect(() => validateFindings([], buildComparison([row], staff))).toThrow();
    expect(JSON.stringify(row)).toBe(before);
  });
});