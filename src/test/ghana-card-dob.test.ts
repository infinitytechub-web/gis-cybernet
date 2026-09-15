import { describe, it, expect } from "vitest";
import { ghanaCardDobState } from "@/hooks/useGhanaCardDobStatus";

const base = {
  id: "1",
  method: "manual_card_entry",
  note: null,
  ghana_card_number: "GHA-123456789-1",
  created_at: "2026-09-15T00:00:00Z",
};

describe("ghanaCardDobState", () => {
  it("reports unverified with no history", () => {
    expect(ghanaCardDobState("1990-01-01", null)).toBe("unverified");
  });

  it("reports matched when the confirmed card date equals the form date", () => {
    expect(
      ghanaCardDobState("1990-01-01", { ...base, status: "matched", recorded_dob: "1990-01-01" }),
    ).toBe("matched");
  });

  it("reports stale when the form date changed after verification", () => {
    expect(
      ghanaCardDobState("1991-02-02", { ...base, status: "matched", recorded_dob: "1990-01-01" }),
    ).toBe("stale");
  });

  it("reports mismatch when the last check failed", () => {
    expect(
      ghanaCardDobState("1990-01-01", { ...base, status: "mismatch", recorded_dob: "1988-05-05" }),
    ).toBe("mismatch");
  });
});
