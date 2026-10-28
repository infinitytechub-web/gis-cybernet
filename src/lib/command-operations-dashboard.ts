import { eachDayOfInterval, format, parseISO } from "date-fns";

export type AttendanceTrendRow = { period_start: string; present: number; late: number; absent: number; excused: number };
export function attendanceTrend(rows: AttendanceTrendRow[], from: string, to: string) {
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => ({
    date: format(date, "yyyy-MM-dd"), present: 0, late: 0, absent: 0, excused: 0,
  }));
  const byDay = new Map(days.map((day) => [day.date, day]));
  rows.forEach((row) => {
    const day = byDay.get(row.period_start.slice(0, 10));
    if (!day) return;
    for (const status of ["present", "late", "absent", "excused"] as const) day[status] += Number(row[status] ?? 0);
  });
  return days;
}

export function pendingRepatriations(ids: string[], signatures: { record_id: string; tier: number; decision: string }[]) {
  const completed = new Set(signatures.filter((signature) => signature.tier === 3 || signature.decision === "not_recommend").map((signature) => signature.record_id));
  return new Set(ids.filter((id) => !completed.has(id))).size;
}