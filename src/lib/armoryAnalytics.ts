import type { ArmoryRecord, ArmoryStaff } from "./armory";
import { weaponNextInspection } from "./armory";

export const TRAINING_STATUSES = ["Qualified", "Refresher due", "Qualification expired", "Training scheduled", "In training", "Remedial training required", "Not qualified", "Exempt"] as const;
export type TrainingStatus = typeof TRAINING_STATUSES[number] | "No training record";

export type TrainingRow = { staff: ArmoryStaff; record: ArmoryRecord | null; month: string | null; location: string | null; status: TrainingStatus; expiry: string | null };

/** Latest training record per officer; a recorded Qualified status past its expiry reads as Qualification expired. */
export function trainingStatusRows(staff: ArmoryStaff[], records: ArmoryRecord[], unitId: string, today: string): TrainingRow[] {
  const certs = records.filter(r => r.kind === "certification" && r.status === "verified");
  return staff.filter(s => s.org_unit_id === unitId).map(s => {
    const mine = certs.filter(r => r.profile_id === s.id).sort((a, b) => (b.details.training_month || b.details.issued || b.created_at).localeCompare(a.details.training_month || a.details.issued || a.created_at));
    const r = mine[0] ?? null;
    if (!r) return { staff: s, record: null, month: null, location: null, status: "No training record" as const, expiry: null };
    let status = (r.details.training_status as TrainingStatus) || (r.status === "verified" ? "Qualified" : "Training scheduled");
    if (status === "Qualified" && r.details.expiry && r.details.expiry < today) status = "Qualification expired";
    return { staff: s, record: r, month: r.details.training_month || (r.details.issued ? r.details.issued.slice(0, 7) : null), location: r.details.location || null, status, expiry: r.details.expiry || null };
  });
}

export type CommandLevel = "hq" | "regional" | "sector" | "other";
export function commandLevel(type: string | null | undefined): CommandLevel {
  if (!type) return "other";
  if (["national", "directorate", "management"].includes(type)) return "hq";
  if (type === "regional") return "regional";
  if (["sector", "district", "station", "command"].includes(type)) return "sector";
  return "other";
}

export type CommandAnalytics = { unitId: string; weapons: number; issued: number; inStore: number; maintenance: number; serviceable: number; unserviceable: number; overdue: number; pending: number; openCustody: number; ammunition: number; trained: number; staff: number };

export function commandAnalytics(records: ArmoryRecord[], staff: ArmoryStaff[], unitId: string, today: string): CommandAnalytics {
  const mine = records.filter(r => r.status !== "archived" && r.org_unit_id === unitId);
  const w = mine.filter(r => r.kind === "weapon");
  const training = trainingStatusRows(staff, records, unitId, today);
  return {
    unitId, weapons: w.length,
    issued: w.filter(x => x.status === "issued").length, inStore: w.filter(x => x.status === "in_store").length, maintenance: w.filter(x => x.status === "maintenance").length,
    serviceable: w.filter(x => x.details.condition === "Serviceable").length,
    unserviceable: w.filter(x => ["Unserviceable", "Condemned"].includes(x.details.condition ?? "")).length,
    overdue: w.filter(x => x.details.condition !== "Condemned" && weaponNextInspection(x, mine) < today).length,
    pending: mine.filter(r => r.status === "pending").length,
    openCustody: mine.filter(r => r.kind === "custody" && ["approved", "handed_over", "acknowledged", "discrepancy"].includes(r.status)).length,
    ammunition: mine.filter(r => r.kind === "ammunition").reduce((n, r) => n + (Number(r.details.quantity) || 0), 0),
    trained: training.filter(t => t.status === "Qualified").length, staff: training.length,
  };
}

export function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }
