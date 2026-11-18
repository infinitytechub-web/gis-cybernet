import { describe, it, expect } from "vitest";
import { reasonsFor, validateLeaveReason } from "../leave-reasons";

describe("leave reasons", () => {
  it("offers maternity-specific reasons", () => {
    expect(reasonsFor("maternity")).toEqual(["Antenatal", "Delivery", "Postnatal care", "Other"]);
  });
  it("requires a reason", () => {
    expect(validateLeaveReason("annual", "", "")).toBe("Please choose a reason");
  });
  it("rejects a reason from another leave type", () => {
    expect(validateLeaveReason("annual", "Illness", "")).not.toBeNull();
  });
  it("requires details for Other", () => {
    expect(validateLeaveReason("sick", "Other", " ")).not.toBeNull();
    expect(validateLeaveReason("sick", "Other", "Dental")).toBeNull();
  });
});
