import { describe, expect, it } from "vitest";
import { buildOrgTree, flattenOrgTree, descendantIds, type OrgUnit } from "./org-hierarchy";

const u = (id: string, name: string, type: OrgUnit["type"], parent_id: string | null): OrgUnit =>
  ({ id, name, code: id, type, parent_id, is_active: true });

const units = [
  u("hq", "The Directorate (HQ)", "directorate", null),
  u("mm", "Management Members", "management", "hq"),
  u("nhq", "National Headquarters", "national", "mm"),
  u("ga", "Greater Accra", "regional", "nhq"),
  u("ops", "HQ OPERATIONS", "national", "hq"),
];

describe("HQ hierarchy standardization", () => {
  it("starts at HQ and lists commands directly under it, without wrapper entries", () => {
    const rows = flattenOrgTree(buildOrgTree(units));
    expect(rows[0].id).toBe("hq");
    expect(rows.map((r) => r.id)).not.toContain("mm");
    expect(rows.map((r) => r.id)).not.toContain("nhq");
    expect(rows.find((r) => r.id === "ga")?.depth).toBe(1);
    expect(rows.find((r) => r.id === "ops")).toBeTruthy();
  });
  it("keeps real parents for editors and scoping", () => {
    const raw = flattenOrgTree(buildOrgTree(units, { collapseHq: false }));
    expect(raw.map((r) => r.id)).toContain("nhq");
    expect(descendantIds(units, "hq")).toEqual(expect.arrayContaining(["mm", "nhq", "ga"]));
  });
});
