import { describe, it, expect } from "vitest";
import {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  DATE_FORMAT_HINT,
  formatDate,
  formatDateTime,
  formatDateLong,
  formatTime,
  calculateAge,
  ageLabel,
  ageGroup,
  toDate,
} from "@/lib/date-format";

const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

describe("date-format tokens", () => {
  it("uses DD/MM/YYYY as the house standard", () => {
    expect(DATE_FORMAT).toBe("dd/MM/yyyy");
    expect(DATE_TIME_FORMAT).toBe("dd/MM/yyyy HH:mm");
    expect(DATE_FORMAT_HINT).toBe("DD/MM/YYYY");
  });
});

describe("formatDate", () => {
  it("renders ISO dates as DD/MM/YYYY", () => {
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
    expect(formatDate("1990-12-31")).toBe("31/12/1990");
  });

  it("renders Date objects and timestamps as DD/MM/YYYY", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe("05/01/2026");
  });

  it("never renders MM/DD ordering for ambiguous dates", () => {
    // 2026-01-02 must be 02/01/2026, not 01/02/2026
    expect(formatDate("2026-01-02")).toBe("02/01/2026");
  });

  it("always matches the DD/MM/YYYY shape across a full year of dates", () => {
    for (let month = 0; month < 12; month++) {
      const value = new Date(2024, month, 15);
      const out = formatDate(value);
      expect(out).toMatch(DDMMYYYY);
      expect(out.slice(0, 2)).toBe("15");
      expect(Number(out.slice(3, 5))).toBe(month + 1);
    }
  });

  it("falls back safely for missing/invalid values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate(null, "")).toBe("");
  });
});

describe("formatDateTime / formatDateLong / formatTime", () => {
  it("keeps the date part in DD/MM/YYYY", () => {
    expect(formatDateTime("2026-04-07T13:45:00Z").slice(0, 10)).toMatch(DDMMYYYY);
    expect(formatDateTime(new Date(2026, 3, 7, 13, 45))).toBe("07/04/2026 13:45");
    expect(formatDateLong(new Date(2026, 3, 7))).toBe("Tuesday, 07/04/2026");
    expect(formatTime(new Date(2026, 3, 7, 9, 5))).toBe("09:05");
  });

  it("falls back for invalid values", () => {
    expect(formatDateTime("nope")).toBe("—");
    expect(formatDateLong(null)).toBe("—");
    expect(formatTime(undefined)).toBe("—");
  });
});

describe("toDate", () => {
  it("parses ISO date, ISO timestamp, Date and epoch inputs", () => {
    expect(toDate("2026-02-01")).toBeInstanceOf(Date);
    expect(toDate("2026-02-01T10:00:00Z")).toBeInstanceOf(Date);
    expect(toDate(new Date())).toBeInstanceOf(Date);
    expect(toDate(0)).toBeInstanceOf(Date);
    expect(toDate("garbage")).toBeNull();
    expect(toDate(new Date("garbage"))).toBeNull();
  });
});

describe("age calculator", () => {
  const now = new Date(2026, 7, 14); // 14/08/2026

  it("computes whole years with month remainder", () => {
    const a = calculateAge("1990-05-14", now);
    expect(a.ok).toBe(true);
    expect(a.years).toBe(36);
    expect(a.months).toBe(3);
    expect(a.label).toBe("36 yrs 3 mo");
  });

  it("handles exact birthdays and singular years", () => {
    expect(calculateAge("2026-08-14", now).label).toBe("0 months");
    expect(calculateAge("2025-08-14", now).label).toBe("1 yr");
  });

  it("reports months for infants", () => {
    expect(calculateAge("2026-02-14", now).label).toBe("6 months");
  });

  it("flags empty, invalid and future dates of birth", () => {
    expect(calculateAge("", now).reason).toBe("empty");
    expect(calculateAge(null, now).reason).toBe("empty");
    expect(calculateAge("oops", now).reason).toBe("invalid");
    expect(calculateAge("2030-01-01", now).reason).toBe("future");
  });

  it("ageLabel falls back when DoB is unusable", () => {
    expect(ageLabel(null)).toBe("—");
    expect(ageLabel("oops", "n/a")).toBe("n/a");
    expect(ageLabel(new Date(Date.now() - 1000 * 60 * 60 * 24 * 400))).toMatch(/yr/);
  });

  it("buckets ages into the standard analytics groups", () => {
    expect(ageGroup(null)).toBe("Unknown");
    const dobFor = (years: number) => new Date(2026 - years, 0, 1).toISOString().slice(0, 10);
    expect(ageGroup(dobFor(10))).toBe("Under 18");
    expect(ageGroup(dobFor(20))).toBe("18–25");
    expect(ageGroup(dobFor(30))).toBe("26–35");
    expect(ageGroup(dobFor(40))).toBe("36–45");
    expect(ageGroup(dobFor(50))).toBe("46–60");
    expect(ageGroup(dobFor(70))).toBe("60+");
  });
});
