import { describe, expect, it } from "vitest";
import { countLeaveDays, isLeaveHoliday } from "@/lib/leave-days";

describe("leave entitlement day calculations", () => {
  const holidays = [
    { date: "2026-03-06", recurring: false },
    { date: "2020-03-10", recurring: true },
  ];

  it("excludes weekends and official holidays for day-based leave", () => {
    expect(countLeaveDays("2026-03-02", "2026-03-10", "annual", holidays)).toBe(5);
  });

  it("keeps calendar spans for maternity and study leave", () => {
    expect(countLeaveDays("2026-03-01", "2026-05-31", "maternity", holidays)).toBe(92);
    expect(countLeaveDays("2023-03-01", "2024-02-29", "study", holidays)).toBe(366);
  });

  it("recognizes recurring holidays by month and day", () => {
    expect(isLeaveHoliday(new Date("2026-03-10T00:00:00"), holidays)).toBe(true);
  });
});