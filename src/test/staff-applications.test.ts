import { describe, it, expect } from "vitest";
import { nextAction, applicantName, inPendingStage, validateStaffApplication } from "@/lib/staff-applications";

describe("staff application pipeline", () => {
  it("requires a real selected staff member", () => {
    expect(validateStaffApplication({ profile: "", type: "position", position: "Officer", unit: "", statement: "x".repeat(20) })).not.toBeNull();
  });
  it("requires a position for position applications", () => {
    expect(validateStaffApplication({ profile: "staff", type: "position", position: " ", unit: "", statement: "x".repeat(20) })).not.toBeNull();
  });
  it("requires a destination for posting applications", () => {
    expect(validateStaffApplication({ profile: "staff", type: "posting", position: "", unit: "", statement: "x".repeat(20) })).not.toBeNull();
  });
  it("accepts 20 statement characters but rejects 19 and whitespace", () => {
    const f = { profile: "staff", type: "position", position: "Officer", unit: "", statement: "x".repeat(19) };
    expect(validateStaffApplication(f)).not.toBeNull();
    expect(validateStaffApplication({ ...f, statement: "  " + "x".repeat(20) + "  " })).toBeNull();
  });
  it("moves approved applications out of decisions into pending postings", () => {
    expect(inPendingStage("recruitment", "panel_recommended", "decisions")).toBe(true);
    expect(inPendingStage("recruitment", "approved", "decisions")).toBe(false);
    expect(inPendingStage("recruitment", "approved", "postings")).toBe(true);
    expect(inPendingStage("recruitment", "posted", "all")).toBe(false);
  });
  it("does not send transfer recommendations to the ordinary approval pipeline", () => {
    expect(inPendingStage("transfer", "panel_recommended", "decisions")).toBe(false);
    expect(inPendingStage("transfer", "submitted", "applications")).toBe(false);
    expect(inPendingStage("transfer", "submitted", "all")).toBe(true);
  });
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
