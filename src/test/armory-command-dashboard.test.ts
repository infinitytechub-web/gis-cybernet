import { describe, it, expect } from "vitest";
import { armoryCommandDashboard, type ArmoryRecord } from "@/lib/armory";
const rec = (o: Partial<ArmoryRecord>): ArmoryRecord => ({ id: Math.random().toString(), kind: "weapon", org_unit_id: "A", reference: "R", title: "T", profile_id: null, asset_id: null, parent_id: null, destination_unit_id: null, status: "in_store", details: {}, created_at: "2026-11-01T00:00:00Z", updated_at: "", version: 1, created_by: "", updated_by: "", ...o } as ArmoryRecord);
describe("armory command dashboard", () => {
  const rs = [
    rec({ details: { condition: "Serviceable" } }), rec({ details: { condition: "Condemned" } }), rec({ org_unit_id: "B", details: { condition: "Serviceable" } }),
    rec({ kind: "custody", status: "pending" }), rec({ kind: "maintenance", status: "pending" }),
    rec({ kind: "transfer", org_unit_id: "B", destination_unit_id: "A", status: "handed_over" }),
    rec({ kind: "certification", status: "verified", details: { expiry: "2026-12-01" } }), rec({ kind: "weapon", status: "archived", details: { condition: "Serviceable" } }),
  ];
  const d = armoryCommandDashboard(rs, "A", "2026-11-18");
  it("counts only this command's live weapons by condition", () => {
    expect(d.weaponsTotal).toBe(2);
    expect(d.weaponsByCondition.find(c => c.condition === "Condemned")?.count).toBe(1);
  });
  it("includes incoming transfers waiting to be received as pending", () => {
    expect(d.pendingByKind).toEqual({ custody: 1, transfer: 1, maintenance: 1, other: 0 });
  });
  it("flags certifications expiring within 30 days", () => { expect(d.certifications.expiring).toBe(1); });
});
