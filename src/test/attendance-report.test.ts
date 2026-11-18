import { describe, expect, it } from "vitest";
import { attendanceCommandMonths, attendanceTotals, fetchAttendanceReport, recordedHours, type AttendanceReportRow } from "@/lib/attendance-report";
import { canAccessPath } from "@/lib/rbac";

const row = (changes: Partial<AttendanceReportRow> = {}): AttendanceReportRow => ({
  id: "record-1", profile_id: "officer-1", owner_user_id: "user-1", staff_name: "OFFICER ONE", staff_id: "GIS-001",
  org_unit_id: "command-a", command_name: "Command A", date: "2026-11-01", status: "present",
  check_in: "2026-11-01T08:00:00Z", check_out: "2026-11-01T16:00:00Z", ...changes,
});
describe("attendance report", () => {
  it("counts actual clock-ins/outs and distinct officers, not rows as headcount", () => {
    expect(attendanceTotals([row(), row({ id: "record-2", check_out: null })])).toEqual({
      officers: 1, records: 2, clockIns: 2, clockOuts: 1, open: 1, hours: 8, invalid: 0,
    });
  });
  it("preserves overnight clock duration and excludes incomplete or reversed pairs", () => {
    expect(recordedHours(row({ check_in: "2026-11-01T22:00:00Z", check_out: "2026-11-02T06:00:00Z" }))).toBe(8);
    expect(recordedHours(row({ check_out: null }))).toBeNull();
    expect(attendanceTotals([row({ check_out: "2026-11-01T07:00:00Z" })]).invalid).toBe(1);
  });
  it("separates command and calendar-month totals", () => {
    const result = attendanceCommandMonths([row(), row({ id: "two", org_unit_id: "command-b", command_name: "Command B" }), row({ id: "three", date: "2026-10-31" })]);
    expect(result.map((r) => [r.command, r.month, r.hours])).toEqual([
      ["Command A", "2026-11", 8], ["Command B", "2026-11", 8], ["Command A", "2026-10", 8],
    ]);
  });
  it("loads every authorized page rather than capping monthly totals", async () => {
    const calls: number[] = [];
    const result = await fetchAttendanceReport(async (start) => {
      calls.push(start);
      return Array.from({ length: start === 0 ? 500 : 2 }, (_, i) => row({ id: String(start + i) }));
    });
    expect(calls).toEqual([0, 500]);
    expect(result).toHaveLength(502);
  });
  it("fails the full read rather than returning partial totals", async () => {
    await expect(fetchAttendanceReport(async (start) => {
      if (start > 0) throw new Error("Connection lost");
      return Array.from({ length: 500 }, () => row());
    })).rejects.toThrow("Connection lost");
  });
  it("reuses existing attendance report permissions", () => {
    expect(canAccessPath("/attendance/report", { role: "admin" })).toBe(true);
    expect(canAccessPath("/attendance/report", { role: "staff" })).toBe(false);
  });
});