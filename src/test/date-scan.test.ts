import { describe, it, expect } from "vitest";
import { findFullDateTokens, isPaddedDayFirst, monthFirstOffenders } from "@/lib/date-scan";

describe("monthFirstOffenders", () => {
  it("accepts day-first dates", () => {
    expect(monthFirstOffenders("Booked in 14/08/2026 and released 09/03/2026")).toEqual([]);
    expect(monthFirstOffenders("Trend: 01/02 02/02 28/02")).toEqual([]);
  });

  it("flags month-first full dates", () => {
    expect(monthFirstOffenders("DoB 03/14/1990")).toEqual(["03/14/1990"]);
    expect(monthFirstOffenders("Reported 12/31/2025 by desk")).toEqual(["12/31/2025"]);
  });

  it("flags month-first short chart labels", () => {
    expect(monthFirstOffenders("Week 08/14 spike")).toEqual(["08/14"]);
  });

  it("ignores non-date slash tokens", () => {
    expect(monthFirstOffenders("Ratio 3/4 and 10/10 pass, 100/200 cases")).toEqual([]);
  });

  it("de-duplicates repeated offenders", () => {
    expect(monthFirstOffenders("03/14/1990 03/14/1990")).toEqual(["03/14/1990"]);
  });
});

describe("token helpers", () => {
  it("extracts full date tokens", () => {
    expect(findFullDateTokens("a 01/02/2026 b 3/4/26 c")).toEqual(["01/02/2026", "3/4/26"]);
  });

  it("requires zero padded day-first output", () => {
    expect(isPaddedDayFirst("09/03/2026")).toBe(true);
    expect(isPaddedDayFirst("09/03/26")).toBe(true);
    expect(isPaddedDayFirst("9/3/2026")).toBe(false);
    expect(isPaddedDayFirst("2026-03-09")).toBe(false);
  });
});
