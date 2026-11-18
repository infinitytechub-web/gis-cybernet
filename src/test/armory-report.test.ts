import { describe, it, expect } from "vitest";
import { armoryReportEntries, armoryMonthlyReport, armoryReportTotals, type ArmoryRecord } from "@/lib/armory";
const rec = (p: Partial<ArmoryRecord>): ArmoryRecord => ({ id: Math.random().toString(), kind: "custody", org_unit_id: "A", reference: "R", title: "T", profile_id: null, asset_id: null, parent_id: null, destination_unit_id: null, status: "approved", details: {}, created_by: "u", updated_by: "u", created_at: "2026-11-05T10:00:00Z", updated_at: "", version: 1, ...p });
describe("armory monthly report", () => {
  it("counts a transfer under both sending and receiving commands", () => {
    const e = armoryReportEntries([rec({ kind: "transfer", destination_unit_id: "B" })]);
    expect(e.map(x => `${x.unitId}:${x.side}`)).toEqual(["A:sent", "B:received"]);
  });
  it("groups per command and month using the inspection date", () => {
    const rows = armoryMonthlyReport(armoryReportEntries([rec({}), rec({}), rec({ kind: "maintenance", details: { date: "2026-10-02" } })]));
    expect(rows).toEqual([
      { unitId: "A", month: "2026-11", custody: 2, transfer: 0, maintenance: 0, certification: 0, total: 2 },
      { unitId: "A", month: "2026-10", custody: 0, transfer: 0, maintenance: 1, certification: 0, total: 1 },
    ]);
  });
  it("excludes archived and non-report records", () => {
    expect(armoryReportEntries([rec({ status: "archived" }), rec({ kind: "weapon" })])).toHaveLength(0);
  });
  it("splits custody out vs returned and certification expiry", () => {
    const t = armoryReportTotals(armoryReportEntries([rec({}), rec({ status: "returned" }), rec({ status: "draft" }),
      rec({ kind: "certification", details: { issued: "2026-01-01", expiry: "2026-11-01" } }),
      rec({ kind: "certification", details: { issued: "2026-01-01", expiry: "2026-12-01" } }),
      rec({ kind: "certification", details: { issued: "2026-01-01", expiry: "2027-06-01" } })]), "2026-11-18");
    expect([t.custodyIssued, t.custodyReturned, t.custodyOut]).toEqual([2, 1, 1]);
    expect([t.certValid, t.certExpiring, t.certExpired]).toEqual([1, 1, 1]);
  });
});
