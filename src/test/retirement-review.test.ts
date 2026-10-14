import { describe, it, expect } from "vitest";
import { canConfirmRetirement } from "@/components/staff/RetirementReviewDialog";

describe("retirement confirmation gating", () => {
  it("allows saving when nobody is retired", () => {
    expect(canConfirmRetirement(0, false, "")).toBe(true);
  });
  it("requires both the tick and the exact count", () => {
    expect(canConfirmRetirement(12, false, "12")).toBe(false);
    expect(canConfirmRetirement(12, true, "")).toBe(false);
    expect(canConfirmRetirement(12, true, "11")).toBe(false);
    expect(canConfirmRetirement(12, true, " 12 ")).toBe(true);
  });
});
