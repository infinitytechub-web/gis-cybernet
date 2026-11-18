import { describe, it, expect } from "vitest";
import { armoryActions, armoryTotals, armoryAlerts, armoryEditable, armoryFormSchema, type ArmoryRecord } from "./armory";
const row = (overrides: Partial<ArmoryRecord> = {}): ArmoryRecord => ({id:"r",kind:"custody",org_unit_id:"c",reference:"R",title:"Record",profile_id:"p",asset_id:"w",parent_id:null,destination_unit_id:null,status:"pending",details:{},created_by:"creator",updated_by:"creator",created_at:"2026-11-18",updated_at:"2026-11-18",version:1,...overrides});
describe("integrated Armory & Weapons safeguards",()=>{
  it("prevents a creator approving their own custody request",()=>expect(armoryActions(row(),true,"creator")).not.toContain("approve"));
  it("prevents the latest editor approving a request",()=>expect(armoryActions(row({updated_by:"editor"}),true,"editor")).not.toContain("approve"));
  it("allows independent command approval",()=>expect(armoryActions(row(),true,"head")).toEqual(["approve","reject"]));
  it("withholds approval from non-head personnel",()=>expect(armoryActions(row(),false,"officer")).toEqual([]));
  it("acknowledgement belongs to the actual recipient",()=>{expect(armoryActions(row({status:"approved"}),false,"other","recipient")).not.toContain("acknowledge"); expect(armoryActions(row({status:"approved"}),false,"recipient","recipient")).toContain("acknowledge");});
  it("retains final custody history without more transitions",()=>expect(armoryActions(row({status:"returned"}),true,"head")).toEqual([]));
  it("locks closed audits",()=>expect(armoryEditable(row({kind:"audit",status:"closed"}))).toBe(false));
  it("totals count real active weapons and independently verified ammunition only",()=>expect(armoryTotals([row({kind:"weapon",status:"in_store"}),row({kind:"weapon",status:"archived"}),row({kind:"ammunition",status:"pending",details:{quantity:"10"}}),row({kind:"ammunition",status:"verified",details:{quantity:"20"}})])).toMatchObject({weapons:1,inStore:1,ammunition:20}));
  it("flags expiry and overdue review based on current dates",()=>expect(armoryAlerts([row({kind:"certification",status:"verified",details:{expiry:"2026-11-17"}}),row({kind:"maintenance",status:"active",details:{next_review:"2026-11-19"}})],"2026-11-18")).toHaveLength(1));
  it("requires a traceable reason",()=>expect(armoryFormSchema.safeParse({reference:"R",title:"Weapon",reason:""}).success).toBe(false));
});