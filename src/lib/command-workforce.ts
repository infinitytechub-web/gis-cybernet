export type WorkforceRow = {
  id: string; name: string; status?: string; rank?: string | null; unit?: string | null;
  shift?: string; start_time?: string; end_time?: string; start_date?: string;
  end_date?: string | null; staff_profile_id?: string; period_year?: number; period_month?: number | null;
};
export type CommandWorkforce = {
  assigned: boolean; command?: { id: string; name: string }; day?: string; year?: number;
  staff: WorkforceRow[]; shifts: WorkforceRow[]; leave: WorkforceRow[];
  appraisals: WorkforceRow[] | null; shift_staff: number; leave_staff: number; appraisal_access: boolean;
};
export function parseCommandWorkforce(value: unknown): CommandWorkforce {
  if (!value || typeof value !== "object" || !("assigned" in value)) throw new Error("Command figures unavailable");
  if (value.assigned === false) return { assigned: false, staff: [], shifts: [], leave: [], appraisals: null, shift_staff: 0, leave_staff: 0, appraisal_access: false };
  const data = value as CommandWorkforce;
  if (!data.command?.id || !data.command.name || ![data.staff, data.shifts, data.leave].every(Array.isArray) ||
      !Number.isInteger(data.shift_staff) || !Number.isInteger(data.leave_staff) ||
      typeof data.appraisal_access !== "boolean" || (data.appraisal_access && !Array.isArray(data.appraisals))) throw new Error("Command figures incomplete");
  return data;
}
export function filterWorkforceRows(rows: WorkforceRow[], search: string, status: string) {
  const term = search.trim().toLowerCase();
  return rows.filter(row => (status === "all" || row.status === status) &&
    [row.name, row.rank, row.unit, row.shift].filter(Boolean).join(" ").toLowerCase().includes(term));
}