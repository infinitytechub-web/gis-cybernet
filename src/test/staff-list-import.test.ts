import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseStaffListFile, realStaffIdKey } from "@/lib/staff-list-import";

function file(aoa: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return { name: "list.xlsx", arrayBuffer: async () => buf } as unknown as File;
}

describe("staff list import duplicates", () => {
  it("treats placeholder IDs as blank", () => {
    expect(realStaffIdKey("xxxxxx")).toBe("");
    expect(realStaffIdKey(" XXX ")).toBe("");
    expect(realStaffIdKey("N/A")).toBe("");
    expect(realStaffIdKey("---")).toBe("");
    expect(realStaffIdKey("gis-001")).toBe("GIS-001");
  });

  it("does not skip rows sharing a placeholder staff ID", async () => {
    const { rows } = await parseStaffListFile(file([
      ["STAFF ID", "SURNAME", "FIRST NAME", "RANK"],
      ["xxxxxx", "Mensah", "Ama", "INSP"],
      ["xxxxxx", "Owusu", "Kofi", "INSP"],
      ["xxxxxx", "Boateng", "Esi", "INSP"],
    ]));
    expect(rows.every((r) => r.outcome === "ready")).toBe(true);
  });

  it("still skips real duplicate IDs and repeated names", async () => {
    const { rows } = await parseStaffListFile(file([
      ["STAFF ID", "SURNAME", "FIRST NAME", "RANK"],
      ["GIS-1", "Mensah", "Ama", "INSP"],
      ["GIS-1", "Owusu", "Kofi", "INSP"],
      ["", "MENSAH ", " ama", "INSP"],
    ]));
    expect(rows.map((r) => r.outcome)).toEqual(["ready", "skipped", "skipped"]);
  });
});
