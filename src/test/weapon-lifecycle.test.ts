import { describe, it, expect } from "vitest";
import { weaponLifecycle, weaponServiceSummary, type ArmoryRecord } from "@/lib/armory";
const rec = (o: Partial<ArmoryRecord>): ArmoryRecord => ({ id: Math.random().toString(), kind: "custody", org_unit_id: "u", reference: "R", title: "T", profile_id: null, asset_id: "w1", parent_id: null, destination_unit_id: null, status: "approved", details: {}, created_at: "2026-11-01T10:00:00Z", updated_at: "", version: 1, created_by: "", updated_by: "", ...o } as ArmoryRecord);
describe("weapon lifecycle", () => {
  const rs = [
    rec({ kind: "maintenance", status: "approved", details: { date: "2026-10-01", next_review: "2026-11-10" } }),
    rec({ kind: "custody", status: "returned" }), rec({ kind: "custody", status: "acknowledged" }),
    rec({ kind: "transfer", status: "received" }), rec({ kind: "custody", asset_id: "other" }), rec({ kind: "certification" }),
  ];
  it("only includes this weapon's custody, transfer and inspection records, oldest first", () => {
    const l = weaponLifecycle(rs, "w1");
    expect(l).toHaveLength(4);
    expect(l[0].kind).toBe("maintenance");
  });
  it("counts open custody and flags an overdue review", () => {
    const s = weaponServiceSummary(weaponLifecycle(rs, "w1"), "2026-11-18");
    expect(s.custodyIssues).toBe(2); expect(s.custodyOpen).toBe(1);
    expect(s.transfersCompleted).toBe(1); expect(s.lastInspection).toBe("2026-10-01"); expect(s.reviewOverdue).toBe(true);
  });
});
