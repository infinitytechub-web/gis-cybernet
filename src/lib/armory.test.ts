import { describe, it, expect } from "vitest";
import { armoryActions, armoryTotals, armoryAlerts, armoryEditable, armoryFormSchema, armoryReportRows, type ArmoryRecord } from "./armory";
const row = (overrides: Partial<ArmoryRecord> = {}): ArmoryRecord => ({id:"r",kind:"custody",org_unit_id:"c",reference:"R",title:"Record",profile_id:"p",asset_id:"w",parent_id:null,destination_unit_id:null,status:"pending",details:{},created_by:"creator",updated_by:"creator",created_at:"2026-11-18",updated_at:"2026-11-18",version:1,...overrides});
describe("integrated Armory & Weapons safeguards",()=>{
  it("prevents a creator approving their own custody request",()=>expect(armoryActions(row(),true,"creator")).not.toContain("approve"));
  it("prevents the latest editor approving a request",()=>expect(armoryActions(row({updated_by:"editor"}),true,"editor")).not.toContain("approve"));
  it("allows independent command approval",()=>expect(armoryActions(row(),true,"head")).toEqual(["approve","reject"]));
  it("withholds approval from non-head personnel",()=>expect(armoryActions(row(),false,"officer")).toEqual([]));
  it("acknowledgement belongs to the actual recipient",()=>{expect(armoryActions(row({status:"handed_over"}),false,"other","recipient")).not.toContain("acknowledge"); expect(armoryActions(row({status:"handed_over"}),false,"recipient","recipient")).toContain("acknowledge");});
  it("retains final custody history without more transitions",()=>expect(armoryActions(row({status:"returned"}),true,"head")).toEqual([]));
  it("locks closed audits",()=>expect(armoryEditable(row({kind:"audit",status:"closed"}))).toBe(false));
  it("totals count real active weapons and independently verified ammunition only",()=>expect(armoryTotals([row({kind:"weapon",status:"in_store"}),row({kind:"weapon",status:"archived"}),row({kind:"ammunition",status:"pending",details:{quantity:"10"}}),row({kind:"ammunition",status:"verified",details:{quantity:"20"}})])).toMatchObject({weapons:1,inStore:1,ammunition:20}));
  it("flags expiry and overdue review based on current dates",()=>expect(armoryAlerts([row({kind:"certification",status:"verified",details:{expiry:"2026-11-17"}}),row({kind:"maintenance",status:"active",details:{next_review:"2026-11-19"}})],"2026-11-18")).toHaveLength(1));
  it("requires a traceable reason",()=>expect(armoryFormSchema.safeParse({reference:"R",title:"Weapon",reason:""}).success).toBe(false));
  it("locks submitted custody details",()=>expect(armoryEditable(row({status:"pending"}))).toBe(false));
  it("reports only selected register records",()=>expect(armoryReportRows([row({kind:"weapon"}),row({kind:"ammunition"})],"weapon","2026-11-18")).toEqual([row({kind:"weapon"})]));
  it("pending report excludes finalized requests",()=>expect(armoryReportRows([row(),row({status:"returned"})],"pending","2026-11-18")).toEqual([row()]));
});
import { weaponNextInspection, addMonthsIso, armoryCommandDashboard } from "./armory";
describe("automatic inspection schedule", () => {
  const w = { id: "w1", kind: "weapon", status: "in_store", org_unit_id: "u", created_at: "2026-01-10T00:00:00Z", details: {} } as never;
  it("is due 3 months after registration when never inspected", () => expect(weaponNextInspection(w, [])).toBe("2026-04-10"));
  it("is due 3 months after the last inspection without a next review", () => expect(weaponNextInspection(w, [{ id: "i", kind: "maintenance", status: "approved", asset_id: "w1", org_unit_id: "u", created_at: "x", details: { date: "2026-11-30" } } as never])).toBe("2027-02-28"));
  it("uses the inspection's own next review when set", () => expect(weaponNextInspection(w, [{ id: "i", kind: "maintenance", status: "approved", asset_id: "w1", org_unit_id: "u", created_at: "x", details: { date: "2026-02-01", next_review: "2026-03-01" } } as never])).toBe("2026-03-01"));
  it("counts overdue weapons on the dashboard by date alone", () => expect(armoryCommandDashboard([w], "u", "2026-04-11").inspections.overdue).toBe(1));
  it("clamps month ends", () => expect(addMonthsIso("2026-08-31", 3)).toBe("2026-11-30"));
});

import { trainingStatusRows, commandLevel } from "./armoryAnalytics";
describe("weapon training status", () => {
  const s = { id: "p1", user_id: null, first_name: "A", last_name: "B", staff_id: "X", org_unit_id: "u" };
  const cert = (details: Record<string, string>) => ({ id: "c", kind: "certification", status: "verified", profile_id: "p1", org_unit_id: "u", created_at: "2026-01-01", details } as never);
  it("shows officers with no record", () => expect(trainingStatusRows([s], [], "u", "2026-11-18")[0].status).toBe("No training record"));
  it("reads month, location and status", () => expect(trainingStatusRows([s], [cert({ training_month: "2026-03", location: "Accra Range", training_status: "Refresher due", expiry: "2027-01-01" })], "u", "2026-11-18")[0]).toMatchObject({ month: "2026-03", location: "Accra Range", status: "Refresher due" }));
  it("treats a qualified record past expiry as expired", () => expect(trainingStatusRows([s], [cert({ training_status: "Qualified", expiry: "2026-11-01" })], "u", "2026-11-18")[0].status).toBe("Qualification expired"));
  it("ignores training not yet verified by a command head", () => expect(trainingStatusRows([s], [{ ...(cert({ training_status: "Qualified", expiry: "2027-01-01" }) as object), status: "pending" } as never], "u", "2026-11-18")[0].status).toBe("No training record"));
  it("groups commands by level", () => expect([commandLevel("national"), commandLevel("regional"), commandLevel("sector")]).toEqual(["hq", "regional", "sector"]));
});
