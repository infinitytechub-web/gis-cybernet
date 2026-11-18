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
export type ArmoryCommand = { id: string; name: string; can_approve: boolean; can_manage: boolean; can_manage_weapons?: boolean; active: boolean };
export type ArmoryStaff = { id: string; user_id: string | null; first_name: string; last_name: string; staff_id: string; org_unit_id: string };
export type ArmoryContext = { commands: ArmoryCommand[]; staff: ArmoryStaff[] };
export const armoryFormSchema = z.object({
  reference: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3, "Enter a reason of at least 3 characters").max(1000),
});
export function armoryReportRows(records: ArmoryRecord[], kind: string, today: string) {
  if (kind === "exceptions") return armoryAlerts(records, today);
  if (kind === "pending") return records.filter(r => r.status === "pending");
  return kind === "all" ? records : records.filter(r => r.kind === kind);
}
export type ArmoryField = { key: string; label: string; type?: "date" | "number"; required?: boolean; options?: string[] };
export const ARMORY_FIELDS: Record<ArmoryKind, ArmoryField[]> = {
  weapon: [{key:"serial",label:"Serial number",required:true},{key:"registration",label:"Registration reference",required:true},{key:"weapon_type",label:"Weapon type",required:true,options:["Pistol","Revolver","Rifle","Shotgun","Submachine Gun","Machine Gun","Less-Lethal","Other"]},{key:"model",label:"Model",required:true},{key:"condition",label:"Condition",required:true,options:["Serviceable","Needs Maintenance","Unserviceable","Condemned"]},{key:"classification",label:"Classification"},{key:"manufacturer",label:"Manufacturer"},{key:"acquisition_date",label:"Acquisition date",type:"date"},{key:"source",label:"Acquisition source"},{key:"facility",label:"Storage facility reference"},{key:"document",label:"Acquisition document reference"}],
  ammunition: [{key:"batch",label:"Batch / lot",required:true},{key:"category",label:"Category"},{key:"manufacturer",label:"Manufacturer"},{key:"quantity",label:"Reconciled quantity",type:"number",required:true},{key:"received",label:"Quantity received",type:"number"},{key:"expiry",label:"Expiry date",type:"date"},{key:"facility",label:"Storage facility reference"}],
  personnel: [{key:"responsibilities",label:"Responsibilities",required:true},{key:"certification",label:"Certification reference",required:true},{key:"expiry",label:"Authorization expiry",type:"date",required:true}],
  custody: [{key:"authorization",label:"Authorization reference"},{key:"purpose",label:"Purpose",required:true},{key:"due_date",label:"Expected return date",type:"date"}],
  facility: [{key:"address",label:"Administrative address",required:true},{key:"custodian",label:"Custodian"},{key:"capacity",label:"Approved capacity reference"},{key:"verified_date",label:"Last verification",type:"date"}],
  transfer: [{key:"authorization",label:"Transfer authorization reference"},{key:"officers",label:"Administrative officers"},{key:"document",label:"Handover document reference"}],
  maintenance: [{key:"category",label:"Category",required:true,options:["Routine Inspection","Preventive Service","Repair","Condition Assessment"]},{key:"date",label:"Inspection date",type:"date",required:true},{key:"officer",label:"Inspection officer",required:true},{key:"provider",label:"Authorized service provider"},{key:"compliance",label:"Compliance",options:["Scheduled","Compliant","Overdue"]},{key:"next_review",label:"Next review",type:"date",required:true},{key:"condition_after",label:"Condition after inspection",options:["Serviceable","Needs Maintenance","Unserviceable","Condemned"]},{key:"document",label:"Document reference"}],
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
    if (r.status === "approved") actions = ["handover", ...(canApprove ? ["cancel"] : [])];
    if (r.kind === "custody" && ["handed_over","acknowledged","discrepancy"].includes(r.status)) actions = ["return", ...(r.status !== "discrepancy" ? ["discrepancy"] : []), ...(r.status === "handed_over" && recipientUserId === userId ? ["acknowledge"] : [])];
  } else if (r.kind === "audit") {
    if (r.status === "scheduled") actions = ["submit"];
    if (r.status === "pending" && independent) actions = ["approve","reject"];
    if (r.status === "approved" && independent) actions = ["close"];
  } else if (["ammunition","certification","personnel"].includes(r.kind)) {
    if (r.status === "pending" && independent) actions = [r.kind === "personnel" ? "authorize" : "verify", "reject"];
    if (r.kind === "personnel" && r.status === "authorized" && independent) actions = ["suspend"];
  } else if (r.kind === "weapon") {
    actions = [...(independent ? ["verify"] : []), ...(r.status === "in_store" ? ["maintenance"] : r.status === "maintenance" ? ["release"] : [])];
  } else if (r.kind === "maintenance") {
    if (r.status === "active") actions = ["start", ...(canApprove ? ["cancel"] : [])];
    if (r.status === "in_progress") actions = ["submit", ...(canApprove ? ["cancel"] : [])];
    if (r.status === "pending" && independent) actions = ["approve","reject"];
  }
  else if (r.kind === "finding" && r.status === "open") actions = ["resolve"];
  else if (r.kind === "corrective") actions = r.status === "open" ? ["start","complete"] : r.status === "in_progress" ? ["complete"] : [];
  if (canApprove && ["weapon","facility","maintenance","certification","personnel"].includes(r.kind) && !["issued","reserved"].includes(r.status)) actions.push("archive");
  return actions;
}
export function armoryEditable(r: ArmoryRecord) {
  if (r.kind === "maintenance" && !["active","in_progress"].includes(r.status)) return false;
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
export const ARMORY_REPORT_KINDS = ["custody", "transfer", "maintenance", "certification"] as const;
export type ArmoryReportKind = typeof ARMORY_REPORT_KINDS[number];
export type ArmoryReportEntry = { record: ArmoryRecord; unitId: string; month: string; date: string; side?: "sent" | "received" };
export type ArmoryMonthRow = { unitId: string; month: string; custody: number; transfer: number; maintenance: number; certification: number; total: number };
const CUSTODY_ISSUED = ["handed_over", "acknowledged", "discrepancy", "returned", "closed"];
const CUSTODY_RETURNED = ["returned", "closed"];
const INSPECTION_PENDING = ["draft", "pending", "scheduled", "active", "in_progress"];

/** Date a record belongs to for monthly reporting (ISO yyyy-MM-dd). */
export function armoryReportDate(r: ArmoryRecord) {
  const d = r.kind === "maintenance" ? r.details.date : r.kind === "certification" ? r.details.issued : "";
  return (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : r.created_at.slice(0, 10));
}

/** One entry per command a record counts under; transfers count for origin (sent) and destination (received). */
export function armoryReportEntries(records: ArmoryRecord[]): ArmoryReportEntry[] {
  const out: ArmoryReportEntry[] = [];
  for (const r of records) {
    if (!(ARMORY_REPORT_KINDS as readonly string[]).includes(r.kind) || r.status === "archived") continue;
    const date = armoryReportDate(r); const month = date.slice(0, 7);
    if (r.kind === "transfer") {
      out.push({ record: r, unitId: r.org_unit_id, month, date, side: "sent" });
      if (r.destination_unit_id && r.destination_unit_id !== r.org_unit_id) out.push({ record: r, unitId: r.destination_unit_id, month, date, side: "received" });
    } else out.push({ record: r, unitId: r.org_unit_id, month, date });
  }
  return out;
}

export function armoryMonthlyReport(entries: ArmoryReportEntry[]): ArmoryMonthRow[] {
  const map = new Map<string, ArmoryMonthRow>();
  for (const e of entries) {
    const key = `${e.unitId}|${e.month}`;
    const row = map.get(key) ?? { unitId: e.unitId, month: e.month, custody: 0, transfer: 0, maintenance: 0, certification: 0, total: 0 };
    row[e.record.kind as ArmoryReportKind] += 1; row.total += 1; map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month) || a.unitId.localeCompare(b.unitId));
}

export function armoryReportTotals(entries: ArmoryReportEntry[], today: string) {
  const soon = new Date(`${today}T00:00:00Z`); soon.setUTCDate(soon.getUTCDate() + 30); const soonIso = soon.toISOString().slice(0, 10);
  const of = (k: ArmoryReportKind) => entries.filter(e => e.record.kind === k);
  const custody = of("custody"), transfer = of("transfer"), insp = of("maintenance"), cert = of("certification");
  return {
    custodyIssued: custody.filter(e => CUSTODY_ISSUED.includes(e.record.status)).length,
    custodyReturned: custody.filter(e => CUSTODY_RETURNED.includes(e.record.status)).length,
    custodyOut: custody.filter(e => CUSTODY_ISSUED.includes(e.record.status) && !CUSTODY_RETURNED.includes(e.record.status)).length,
    transfersSent: transfer.filter(e => e.side === "sent").length,
    transfersReceived: transfer.filter(e => e.side === "received").length,
    inspectionsDone: insp.filter(e => !INSPECTION_PENDING.includes(e.record.status)).length,
    inspectionsPending: insp.filter(e => INSPECTION_PENDING.includes(e.record.status)).length,
    certValid: cert.filter(e => (e.record.details.expiry ?? "") > soonIso).length,
    certExpiring: cert.filter(e => { const x = e.record.details.expiry ?? ""; return x >= today && x <= soonIso; }).length,
    certExpired: cert.filter(e => { const x = e.record.details.expiry ?? ""; return !!x && x < today; }).length,
    total: entries.length,
  };
}

export const ARMORY_APPROVAL_KINDS = ["custody", "transfer", "maintenance"] as const;
/** Records awaiting a Command Head decision: pending custody/transfer, or inspections not yet approved. */
export function armoryAwaitingApproval(r: ArmoryRecord) {
  if (r.kind === "custody" || r.kind === "transfer") return r.status === "pending";
  if (r.kind === "maintenance") return r.status === "pending";
  return false;
}
/** Plain-language status shown on each record. */
export function armoryStatusLabel(r: Pick<ArmoryRecord, "kind" | "status">) {
  if (armoryAwaitingApproval(r as ArmoryRecord)) return "Awaiting approval";
  const map: Record<string, string> = { pending: "Awaiting verification", verified: "Verified", authorized: "Authorized", approved: "Approved", rejected: "Rejected", draft: "Draft", cancelled: "Cancelled", acknowledged: "Acknowledged", returned: "Returned", discrepancy: "Discrepancy", handed_over: "Handed over", received: "Received", archived: "Archived", active: "Scheduled", in_progress: "In progress", reserved: "Reserved", issued: "Issued", in_store: "In store", maintenance: "Out of service" };
  return map[r.status] ?? r.status.replace(/_/g, " ");
}

export type WeaponLifecycleEntry = { record: ArmoryRecord; kind: "custody" | "transfer" | "maintenance"; date: string };
export type WeaponServiceSummary = {
  custodyIssues: number; custodyOpen: number; transfers: number; transfersCompleted: number;
  inspections: number; inspectionsApproved: number; lastInspection: string | null; nextReview: string | null; reviewOverdue: boolean;
};
const CLOSED_CUSTODY = ["returned", "rejected", "cancelled", "archived"];
/** Inspection cycle used when an inspection has no explicit next review. */
export const INSPECTION_INTERVAL_MONTHS = 3;
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
/** Next inspection due for a weapon: latest inspection's next review (or its date + cycle); never-inspected weapons fall due one cycle after registration. */
export function weaponNextInspection(weapon: ArmoryRecord, records: ArmoryRecord[]): string {
  const insp = records.filter(r => r.kind === "maintenance" && r.asset_id === weapon.id && !["rejected", "archived", "cancelled"].includes(r.status) && r.details.date);
  const last = insp.map(r => r.details.date as string).sort().pop();
  if (!last) return addMonthsIso(weapon.created_at.slice(0, 10), INSPECTION_INTERVAL_MONTHS);
  return insp.filter(r => r.details.date === last).map(r => r.details.next_review).filter(Boolean).sort().pop() ?? addMonthsIso(last, INSPECTION_INTERVAL_MONTHS);
}
/** Every custody, transfer and inspection record that references this weapon, oldest first. */
export function weaponLifecycle(records: ArmoryRecord[], weaponId: string): WeaponLifecycleEntry[] {
  return records
    .filter(r => r.asset_id === weaponId && (r.kind === "custody" || r.kind === "transfer" || r.kind === "maintenance"))
    .map(r => ({ record: r, kind: r.kind as WeaponLifecycleEntry["kind"], date: r.kind === "maintenance" && r.details.date ? r.details.date : r.created_at.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.record.created_at.localeCompare(b.record.created_at));
}
export function weaponServiceSummary(entries: WeaponLifecycleEntry[], today: string): WeaponServiceSummary {
  const custody = entries.filter(e => e.kind === "custody");
  const transfers = entries.filter(e => e.kind === "transfer" && e.record.status !== "archived");
  const insp = entries.filter(e => e.kind === "maintenance" && !["rejected", "archived"].includes(e.record.status));
  const last = insp.map(e => e.record.details.date).filter(Boolean).sort().pop() ?? null;
  const next = insp.filter(e => e.record.details.date === last).map(e => e.record.details.next_review).filter(Boolean).sort().pop() ?? (last ? addMonthsIso(last, INSPECTION_INTERVAL_MONTHS) : null);
  return {
    custodyIssues: custody.filter(e => !["draft", "rejected", "cancelled"].includes(e.record.status)).length,
    custodyOpen: custody.filter(e => !CLOSED_CUSTODY.includes(e.record.status) && e.record.status !== "draft").length,
    transfers: transfers.length, transfersCompleted: transfers.filter(e => e.record.status === "received").length,
    inspections: insp.length, inspectionsApproved: insp.filter(e => e.record.status === "approved").length,
    lastInspection: last, nextReview: next, reviewOverdue: !!next && next < today,
  };
}

/** Lifecycle stage order per report type, used for the report's status breakdown. */
export const ARMORY_LIFECYCLE: Record<"custody" | "transfer" | "maintenance", string[]> = {
  custody: ["draft", "pending", "approved", "handed_over", "acknowledged", "discrepancy", "returned", "rejected", "cancelled"],
  transfer: ["draft", "pending", "approved", "handed_over", "received", "rejected", "cancelled"],
  maintenance: ["active", "in_progress", "pending", "approved", "cancelled"],
};
export function armoryStatusBreakdown(records: ArmoryRecord[], kind: keyof typeof ARMORY_LIFECYCLE) {
  const of = records.filter(r => r.kind === kind && r.status !== "archived");
  return ARMORY_LIFECYCLE[kind].map(status => ({ status, count: of.filter(r => r.status === status).length }));
}

export const WEAPON_CONDITIONS = ["Serviceable", "Needs Maintenance", "Unserviceable", "Condemned"] as const;
/** Per-command dashboard figures from caller-visible records. */
export function armoryCommandDashboard(records: ArmoryRecord[], unitId: string, today: string) {
  const mine = records.filter(r => r.status !== "archived" && (r.org_unit_id === unitId || (r.kind === "transfer" && r.destination_unit_id === unitId)));
  const soon = new Date(`${today}T00:00:00Z`); soon.setUTCDate(soon.getUTCDate() + 30); const soonIso = soon.toISOString().slice(0, 10);
  const weapons = mine.filter(r => r.kind === "weapon" && r.org_unit_id === unitId);
  const insp = mine.filter(r => r.kind === "maintenance" && r.org_unit_id === unitId);
  const certs = mine.filter(r => r.kind === "certification" && r.org_unit_id === unitId && !["rejected"].includes(r.status));
  const pending = mine.filter(r => r.org_unit_id === unitId && r.status === "pending"
    || (r.kind === "transfer" && r.destination_unit_id === unitId && r.status === "handed_over"));
  return {
    pending,
    pendingByKind: { custody: pending.filter(r => r.kind === "custody").length, transfer: pending.filter(r => r.kind === "transfer").length, maintenance: pending.filter(r => r.kind === "maintenance").length, other: pending.filter(r => !["custody", "transfer", "maintenance"].includes(r.kind)).length },
    inspections: { scheduled: insp.filter(r => r.status === "active").length, inProgress: insp.filter(r => r.status === "in_progress").length, awaiting: insp.filter(r => r.status === "pending").length, approved: insp.filter(r => r.status === "approved").length,
      overdue: weapons.filter(w => w.details.condition !== "Condemned" && weaponNextInspection(w, mine) < today).length,
      dueSoon: weapons.filter(w => { if (w.details.condition === "Condemned") return false; const n = weaponNextInspection(w, mine); return n >= today && n <= soonIso; }).length },
    certifications: { pending: certs.filter(r => r.status === "pending").length, valid: certs.filter(r => r.status === "verified" && (r.details.expiry ?? "") > soonIso).length,
      expiring: certs.filter(r => { const x = r.details.expiry ?? ""; return x >= today && x <= soonIso; }).length, expired: certs.filter(r => { const x = r.details.expiry ?? ""; return !!x && x < today; }).length },
    weaponsByCondition: [...WEAPON_CONDITIONS, "Not set"].map(c => ({ condition: c, count: weapons.filter(w => (w.details.condition || "Not set") === c).length })),
    weaponsTotal: weapons.length,
    weaponsByStatus: { in_store: weapons.filter(w => w.status === "in_store").length, reserved: weapons.filter(w => w.status === "reserved").length, issued: weapons.filter(w => w.status === "issued").length, maintenance: weapons.filter(w => w.status === "maintenance").length },
  };
}
