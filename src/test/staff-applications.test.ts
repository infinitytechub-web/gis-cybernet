import { describe, it, expect } from "vitest";
import { nextAction, applicantName } from "@/lib/staff-applications";

describe("staff application pipeline", () => {
  it("runs shortlist → interview → panel result → admin decision → posting", () => {
    expect(nextAction("position", "submitted", false)).toBe("shortlist");
    expect(nextAction("position", "shortlisted", false)).toBe("schedule");
    expect(nextAction("position", "interview_scheduled", true)).toBe("record");
    expect(nextAction("position", "panel_recommended", false)).toBe("decide");
    expect(nextAction("recruitment", "panel_not_recommended", false)).toBe("decide");
    expect(nextAction("posting", "approved", false)).toBe("post");
    expect(nextAction("posting", "posted", false)).toBeNull();
  });
  it("routes transfers to the transfer approval steps until closed", () => {
    expect(nextAction("transfer", "submitted", false)).toBe("transfer");
    expect(nextAction("transfer", "panel_recommended", false)).toBe("transfer");
    expect(nextAction("transfer", "posted", false)).toBeNull();
  });
  it("names internal and external applicants", () => {
    expect(applicantName({ applicant_kind: "external", external_name: "KOFI MENSAH" })).toBe("KOFI MENSAH");
    expect(applicantName({ applicant_kind: "internal", profiles: { first_name: "AMA", last_name: "OWUSU" } })).toBe("OWUSU AMA");
  });
});
