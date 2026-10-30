import { describe, it, expect } from "vitest";
import { dashboardRetry, dashboardSyncState, reportingSince, sumCounts, validateCommandSnapshot } from "@/lib/dashboard-integrity";

describe("dashboard integrity rules", () => {
  it("includes unassigned personnel in total instead of treating assigned strength as total", () => {
    expect(sumCounts({ assigned: 224, unassigned: 54 })).toBe(278);
  });
  it("does not manufacture a timestamp for an incomplete snapshot", () => {
    expect(() => validateCommandSnapshot({ branches: [] })).toThrow("incomplete");
  });
  it("marks offline data offline even after a successful read", () => {
    expect(dashboardSyncState(false, false, 1000, 2000)).toBe("offline");
  });
  it("does not present failed updates as current", () => {
    expect(dashboardSyncState(true, true, 1000, 2000)).toBe("failed");
  });
  it("marks figures older than two minutes stale", () => {
    expect(dashboardSyncState(true, false, 1000, 121001)).toBe("stale");
  });
  it("retries transient failures at most three times", () => {
    expect(dashboardRetry(2, { message: "Network failed" })).toBe(true);
    expect(dashboardRetry(3, { message: "Network failed" })).toBe(false);
  });
  it("never retries a permission denial", () => {
    expect(dashboardRetry(0, { code: "42501" })).toBe(false);
  });
  it("uses the selected reporting period and leaves all-time unbounded", () => {
    expect(reportingSince("7", Date.parse("2026-10-30T21:57:00Z"))).toBe("2026-10-23T21:57:00.000Z");
    expect(reportingSince("all")).toBeNull();
  });
});