/**
 * Postings & Transfers — internationally standardized HR analytics.
 *
 * Formulas follow widely-cited HR / ILO conventions:
 *  - Tenure / years of service: ISO 8601 calendar diff (full years, residual months).
 *  - Time until retirement: calendar diff to (DOB + retirement_age), expressed as Y/M/D.
 *  - Annualized turnover / transfer rate (ILO):
 *      rate = (separations / avg_headcount) * (365 / period_days) * 100
 *  - Median tenure: 50th percentile of tenure-in-years across the active workforce.
 *  - Retirement risk buckets: <=1y, 1-3y, 3-5y, >5y (UN HR planning convention).
 *  - Mobility index: transfers per staff over a rolling window (default 12 months),
 *    normalized to a per-year rate.
 *
 * All helpers are pure and side-effect free so they can be unit-tested deterministically
 * against fixtures (see postings-analytics.test.ts).
 */

import {
  differenceInCalendarDays,
  differenceInCalendarYears,
  differenceInMonths,
  differenceInYears,
  addYears,
  addMonths,
} from "date-fns";

export interface YearsMonths { years: number; months: number; }
export interface YearsMonthsDays { years: number; months: number; days: number; retired: boolean; }

/** Full calendar years + residual months between dateJoined and asOf. */
export function yearsOfService(dateJoined: Date | string | null, asOf: Date = new Date()): YearsMonths {
  if (!dateJoined) return { years: 0, months: 0 };
  const d = typeof dateJoined === "string" ? new Date(dateJoined) : dateJoined;
  if (isNaN(d.getTime()) || d > asOf) return { years: 0, months: 0 };
  const years = differenceInYears(asOf, d);
  const anchor = addYears(d, years);
  const months = differenceInMonths(asOf, anchor);
  return { years, months };
}

/** Y/M/D until (dob + retirementAge). retired=true if past. */
export function timeUntilRetirement(
  dob: Date | string | null,
  retirementAge = 60,
  asOf: Date = new Date(),
): YearsMonthsDays {
  if (!dob) return { years: 0, months: 0, days: 0, retired: false };
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return { years: 0, months: 0, days: 0, retired: false };
  const retireDate = addYears(d, retirementAge);
  if (retireDate <= asOf) return { years: 0, months: 0, days: 0, retired: true };
  const years = differenceInYears(retireDate, asOf);
  const afterYears = addYears(asOf, years);
  const months = differenceInMonths(retireDate, afterYears);
  const afterMonths = addMonths(afterYears, months);
  const days = differenceInCalendarDays(retireDate, afterMonths);
  return { years, months, days, retired: false };
}

/** ILO annualized transfer/turnover rate as a percentage. */
export function transferTurnoverRate(
  separations: number,
  avgHeadcount: number,
  periodDays: number,
): number {
  if (avgHeadcount <= 0 || periodDays <= 0) return 0;
  return (separations / avgHeadcount) * (365 / periodDays) * 100;
}

export function medianTenureYears(dateJoinedList: Array<Date | string | null>, asOf: Date = new Date()): number {
  const tenures = dateJoinedList
    .map((d) => yearsOfService(d, asOf))
    .map((t) => t.years + t.months / 12)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (tenures.length === 0) return 0;
  const mid = Math.floor(tenures.length / 2);
  return tenures.length % 2 === 0
    ? (tenures[mid - 1] + tenures[mid]) / 2
    : tenures[mid];
}

export interface RetirementBuckets { le1y: number; oneToThree: number; threeToFive: number; over5: number; retired: number; }

export function retirementRiskBuckets(
  staff: Array<{ dob: Date | string | null; retirementAge?: number | null }>,
  asOf: Date = new Date(),
): RetirementBuckets {
  const out: RetirementBuckets = { le1y: 0, oneToThree: 0, threeToFive: 0, over5: 0, retired: 0 };
  for (const s of staff) {
    if (!s.dob) continue;
    const r = timeUntilRetirement(s.dob, s.retirementAge ?? 60, asOf);
    if (r.retired) { out.retired += 1; continue; }
    const totalYears = r.years + r.months / 12;
    if (totalYears <= 1) out.le1y += 1;
    else if (totalYears <= 3) out.oneToThree += 1;
    else if (totalYears <= 5) out.threeToFive += 1;
    else out.over5 += 1;
  }
  return out;
}

/** Transfers per staff, normalised to a per-year rate over windowDays. */
export function mobilityIndex(transfersInWindow: number, headcount: number, windowDays = 365): number {
  if (headcount <= 0 || windowDays <= 0) return 0;
  return (transfersInWindow / headcount) * (365 / windowDays);
}
