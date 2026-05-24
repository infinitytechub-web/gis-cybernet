import { describe, it, expect } from "vitest";
import {
  yearsOfService,
  timeUntilRetirement,
  transferTurnoverRate,
  medianTenureYears,
  retirementRiskBuckets,
  mobilityIndex,
} from "./postings-analytics";

const asOf = new Date("2026-05-24T00:00:00Z");

describe("yearsOfService", () => {
  it("returns 0/0 for null", () => {
    expect(yearsOfService(null, asOf)).toEqual({ years: 0, months: 0 });
  });
  it("computes 10y 0m for exact 10-year anniversary", () => {
    expect(yearsOfService("2016-05-24", asOf)).toEqual({ years: 10, months: 0 });
  });
  it("computes 5y 4m", () => {
    expect(yearsOfService("2021-01-24", asOf)).toEqual({ years: 5, months: 4 });
  });
  it("treats future joined date as 0", () => {
    expect(yearsOfService("2030-01-01", asOf)).toEqual({ years: 0, months: 0 });
  });
});

describe("timeUntilRetirement", () => {
  it("retired=true when past retirement", () => {
    const r = timeUntilRetirement("1960-01-01", 60, asOf);
    expect(r.retired).toBe(true);
  });
  it("returns Y/M/D for future retirement", () => {
    // DOB 1980-05-24, age 60 → retire 2040-05-24 → from 2026-05-24 = 14y 0m 0d
    const r = timeUntilRetirement("1980-05-24", 60, asOf);
    expect(r).toEqual({ years: 14, months: 0, days: 0, retired: false });
  });
  it("handles partial months/days", () => {
    // DOB 1980-08-10, age 60 → retire 2040-08-10 → from 2026-05-24 = 14y 2m 17d
    const r = timeUntilRetirement("1980-08-10", 60, asOf);
    expect(r.years).toBe(14);
    expect(r.months).toBe(2);
    expect(r.days).toBe(17);
  });
});

describe("transferTurnoverRate", () => {
  it("returns 0 with zero headcount", () => {
    expect(transferTurnoverRate(5, 0, 90)).toBe(0);
  });
  it("ILO annualized: 10 separations / 200 avg over 90 days ≈ 20.28%", () => {
    const v = transferTurnoverRate(10, 200, 90);
    expect(v).toBeCloseTo((10 / 200) * (365 / 90) * 100, 4);
  });
});

describe("medianTenureYears", () => {
  it("returns 0 for empty list", () => {
    expect(medianTenureYears([], asOf)).toBe(0);
  });
  it("computes median of odd-sized set", () => {
    const v = medianTenureYears(["2020-05-24", "2018-05-24", "2022-05-24"], asOf);
    expect(v).toBeCloseTo(8, 1); // middle is 2018 → 8y
  });
});

describe("retirementRiskBuckets", () => {
  it("buckets by remaining years", () => {
    const b = retirementRiskBuckets(
      [
        { dob: "1966-01-01" }, // ~0y left → le1y
        { dob: "1964-01-01" }, // retired
        { dob: "1970-01-01" }, // ~4y → threeToFive
        { dob: "1980-01-01" }, // >5y
        { dob: null },
      ],
      asOf,
    );
    expect(b.retired).toBe(1);
    expect(b.le1y).toBe(1);
    expect(b.threeToFive).toBe(1);
    expect(b.over5).toBe(1);
  });
});

describe("mobilityIndex", () => {
  it("returns 0 for empty workforce", () => {
    expect(mobilityIndex(5, 0)).toBe(0);
  });
  it("30 transfers / 100 staff / 365d = 0.30 per staff/yr", () => {
    expect(mobilityIndex(30, 100, 365)).toBeCloseTo(0.3, 6);
  });
  it("normalises window to annual", () => {
    expect(mobilityIndex(15, 100, 180)).toBeCloseTo((15 / 100) * (365 / 180), 6);
  });
});
