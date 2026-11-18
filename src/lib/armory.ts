import { z } from "zod";

export const ARMORY_KINDS = ["weapon", "ammunition", "personnel", "custody", "facility", "transfer", "maintenance", "certification", "audit", "finding", "corrective"] as const;
export type ArmoryKind = typeof ARMORY_KINDS[number];
export const ARMORY_LABELS: Record<ArmoryKind, string> = {
  weapon: "Weapon Register", ammunition: "Ammunition Inventory", personnel: "Personnel & Authorization",
  custody: "Issue & Return", facility: "Armory & Facilities", transfer: "Asset Transfers",
  maintenance: "Maintenance & Inspection", certification: "Training & Certification", audit: "Verification & Audit",
  finding: "Audit Findings", corrective: "Corrective Actions",
};
export type ArmoryRecord = {
  id: string; kind: ArmoryKind; org_unit_id: string; reference: string; title: string;
  profile_id: string | null; asset_id: string | null; parent_id: string | null; destination_unit_id: string | null;
  status: string; details: Record<string, string>; created_by: string; updated_by: string;
  created_at: string; updated_at: string; version: number;
};
export type ArmoryCommand = { id: string; name: string; can_approve: boolean; can_manage: boolean; active: boolean };
export type ArmoryStaff = { id: string; user_id: string | null; first_name: string; last_name: string; staff_id: string; org_unit_id: string };
export type ArmoryContext = { commands: ArmoryCommand[]; staff: ArmoryStaff[] };
export const armoryFormSchema = z.object({
  reference: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3, "Enter a reason of at least 3 characters").max(1000),
});
export type ArmoryField = { key: string; label: string; type?: "date" | "number"; required?: boolean; options?: string[] };
export const ARMORY_FIELDS: Record<ArmoryKind, ArmoryField[]> = {
  weapon: [{key:"serial",label:"Serial number",required:true},{key:"registration",label:"Registration reference",required:true},{key:"classification",label:"Classification"},{key:"manufacturer",label:"Manufacturer"},{key:"model",label:"Model"},{key:"acquisition_date",label:"Acquisition date",type:"date"},{key:"source",label:"Acquisition source"},{key:"facility",label:"Storage facility reference"},{key:"document",label:"Acquisition document reference"}],
  ammunition: [{key:"batch",label:"Batch / lot",required:true},{key:"category",label:"Category"},{key:"manufacturer",label:"Manufacturer"},{key:"quantity",label:"Reconciled quantity",type:"number",required:true},{key:"received",label:"Quantity received",type:"number"},{key:"expiry",label:"Expiry date",type:"date"},{key:"facility",label:"Storage facility reference"}],
  personnel: [{key:"responsibilities",label:"Responsibilities",required:true},{key:"certification",label:"Certification reference",required:true},{key:"expiry",label:"Authorization expiry",type:"date",required:true}],
  custody: [{key:"authorization",label:"Authorization reference"},{key:"purpose",label:"Purpose",required:true},{key:"due_date",label:"Expected return date",type:"date"}],
  facility: [{key:"address",label:"Administrative address",required:true},{key:"custodian",label:"Custodian"},{key:"capacity",label:"Approved capacity reference"},{key:"verified_date",label:"Last verification",type:"date"}],
  transfer: [{key:"authorization",label:"Transfer authorization reference"},{key:"officers",label:"Administrative officers"},{key:"document",label:"Handover document reference"}],
  maintenance: [{key:"category",label:"Category",required:true,options:["Routine Inspection","Preventive Service","Repair","Condition Assessment"]},{key:"date",label:"Inspection date",type:"date",required:true},{key:"officer",label:"Inspection officer",required:true},{key:"provider",label:"Authorized service provider"},{key:"compliance",label:"Compliance",options:["Scheduled","Compliant","Overdue"]},{key:"next_review",label:"Next review",type:"date",required:true},{key:"document",label:"Document reference"}],
  certification: [{key:"provider",label:"Approved training provider",required:true},{key:"issued",label:"Issued date",type:"date",required:true},{key:"expiry",label:"Expiry date",type:"date",required:true},{key:"document",label:"Certification reference"}],
  audit: [{key:"type",label:"Audit type",required:true,options:["Scheduled Inventory Audit","Spot Verification","Annual Reconciliation"]},{key:"scheduled",label:"Scheduled date",type:"date",required:true},{key:"officer",label:"Verification officer",required:true},{key:"supervisor",label:"Supervisor"},{key:"scope",label:"Scope",required:true}],
  finding: [{key:"severity",label:"Severity",required:true,options:["Low","Medium","High","Critical"]},{key:"investigation",label:"Investigation reference"}],
  corrective: [{key:"owner",label:"Responsible officer",required:true},{key:"due_date",label:"Due date",type:"date",required:true}],
};
export function armoryActions(r: ArmoryRecord, canApprove: boolean, userId: string, recipientUserId?: string | null): string[] {
  if (["closed","archived","returned","received","rejected","cancelled"].includes(r.status)) return [];
  const independent = canApprove && r.created_by !== userId && r.updated_by !== userId;
  let actions: string[] = [];
  if (["custody","transfer"].includes(r.kind)) {
    if (r.status === "draft") actions = ["submit", ...(r.created_by === userId || canApprove ? ["cancel"] : [])];
    if (r.status === "pending" && independent) actions = ["approve","reject"];
    if (r.kind === "custody" && ["approved","acknowledged","discrepancy"].includes(r.status)) actions = ["return", ...(r.status !== "discrepancy" ? ["discrepancy"] : []), ...(r.status === "approved" && recipientUserId === userId ? ["acknowledge"] : [])];
    if (r.kind === "transfer" && r.status === "approved") actions = ["handover"];
  } else if (r.kind === "audit") {
    if (r.status === "scheduled") actions = ["submit"];
    if (r.status === "pending" && independent) actions = ["approve","reject"];
    if (r.status === "approved" && independent) actions = ["close"];
  } else if (["ammunition","certification","personnel"].includes(r.kind)) {
    if (r.status === "pending" && independent) actions = [r.kind === "personnel" ? "authorize" : "verify", "reject"];
    if (r.kind === "personnel" && r.status === "authorized" && independent) actions = ["suspend"];
  } else if (r.kind === "weapon") {
    actions = [...(independent ? ["verify"] : []), ...(r.status === "in_store" ? ["maintenance"] : r.status === "maintenance" ? ["release"] : [])];
  } else if (r.kind === "finding" && r.status === "open") actions = ["resolve"];
  else if (r.kind === "corrective") actions = r.status === "open" ? ["start","complete"] : r.status === "in_progress" ? ["complete"] : [];
  if (canApprove && ["weapon","facility","maintenance","certification","personnel"].includes(r.kind) && !["issued","reserved"].includes(r.status)) actions.push("archive");
  return actions;
}
export function armoryEditable(r: ArmoryRecord) {
  return !["closed","archived"].includes(r.status) && (!["custody","transfer","audit","ammunition","personnel","certification"].includes(r.kind) || ["draft","pending","scheduled"].includes(r.status)) && (!(["custody","transfer"].includes(r.kind)) || r.status === "draft");
}
export function armoryTotals(records: ArmoryRecord[]) {
  const weapons = records.filter(r => r.kind === "weapon" && r.status !== "archived");
  return { weapons: weapons.length, inStore: weapons.filter(r=>r.status==="in_store").length,
    issued: weapons.filter(r=>r.status==="issued").length,
    ammunition: records.filter(r=>r.kind==="ammunition" && r.status==="verified").reduce((n,r)=>n+Number(r.details.quantity || 0),0),
    pending: records.filter(r=>r.status==="pending").length, openFindings: records.filter(r=>r.kind==="finding" && r.status==="open").length };
}
export function armoryAlerts(records: ArmoryRecord[], today: string) {
  return records.filter(r=>r.status!=="archived" && (r.status==="pending" || r.status==="discrepancy" || (r.kind==="finding" && r.status==="open") || (!!r.details.expiry && r.details.expiry<today) || (r.kind==="maintenance" && !!r.details.next_review && r.details.next_review<today) || (r.kind==="corrective" && r.status!=="completed" && !!r.details.due_date && r.details.due_date<today)));
}