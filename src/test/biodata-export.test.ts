import { describe, it, expect } from "vitest";
import { buildBioDataCsv } from "@/lib/biodata-csv";
import type { BioDataRecord } from "@/lib/biodata-record";

const record: BioDataRecord = {
  fullName: "DOE John",
  staffId: "GIS-00001",
  sections: [
    { kind: "pairs", letter: "A", title: "Form administration", pairs: [["Staff ID", "GIS-00001"], ["Status", "active"]] },
    { kind: "pairs", letter: "E", title: "Medical & welfare", note: "restricted access", pairs: [["Access", "Restricted — not included in this copy"]] },
    { kind: "table", letter: "F", title: "Education", head: ["School", "Qualification"], rows: [["=Legon", "BA"]] },
    { kind: "table", letter: "L", title: "Verification", head: ["Stage", "Name"], rows: [] },
  ],
};

describe("bio-data CSV export", () => {
  const csv = buildBioDataCsv(record);
  const lines = csv.split("\n");

  it("writes a flat Section/Field/Value sheet covering every section", () => {
    expect(lines[0]).toBe("Section,Field,Value");
    expect(csv).toContain("A. Form administration,Staff ID,GIS-00001");
    expect(csv).toContain("F. Education,#1 School");
    // empty list section still appears
    expect(csv).toContain("L. Verification,—,—");
  });

  it("keeps restricted-section notes instead of the data", () => {
    expect(csv).toContain("Restricted — not included in this copy");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csv).toContain("'=Legon");
    expect(csv).not.toMatch(/,=Legon/);
  });
});
