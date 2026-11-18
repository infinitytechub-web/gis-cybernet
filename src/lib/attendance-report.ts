export interface AttendanceReportRow {
  id: string;
  profile_id: string;
  owner_user_id: string | null;
  staff_name: string;
  staff_id: string | null;
  org_unit_id: string | null;
  command_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export function recordedHours(row: Pick<AttendanceReportRow, "check_in" | "check_out">): number | null {
  if (!row.check_in || !row.check_out) return null;
  const hours = (Date.parse(row.check_out) - Date.parse(row.check_in)) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

export function attendanceTotals(rows: AttendanceReportRow[]) {
  return {
    officers: new Set(rows.map((r) => r.profile_id)).size,
    records: rows.length,
    clockIns: rows.filter((r) => r.check_in).length,
    clockOuts: rows.filter((r) => r.check_out).length,
    open: rows.filter((r) => r.check_in && !r.check_out).length,
    hours: rows.reduce((sum, r) => sum + (recordedHours(r) ?? 0), 0),
    invalid: rows.filter((r) => r.check_in && r.check_out && recordedHours(r) === null).length,
  };
}

export function attendanceCommandMonths(rows: AttendanceReportRow[]) {
  const groups = new Map<string, { command: string; month: string; rows: AttendanceReportRow[] }>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const key = `${row.org_unit_id ?? "unassigned"}|${month}`;
    const group = groups.get(key) ?? { command: row.command_name, month, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, command: group.command, month: group.month, ...attendanceTotals(group.rows) }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.command.localeCompare(b.command));
}

/** Fetch every authorized page; a later failure must not return partial totals. */
export async function fetchAttendanceReport(fetchPage: (from: number, to: number) => Promise<AttendanceReportRow[]>) {
  const rows: AttendanceReportRow[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const page = await fetchPage(offset, offset + size - 1);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}