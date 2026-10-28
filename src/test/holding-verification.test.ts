import { describe, expect, it } from "vitest";
import { canReviewVerification, validateVerificationSubmission } from "@/lib/holding-verification";
import { canAccessModule } from "@/lib/rbac";

describe("Holding Center staff verification", () => {
  it("allows staff to submit verification without granting custody access", () => {
    expect(canAccessModule("holding-verification", { role: "staff" })).toBe(true);
    expect(canAccessModule("detention", { role: "staff" })).toBe(false);
  });
  it("requires a Staff ID", () => {
    expect(validateVerificationSubmission("   ", true)).not.toBeNull();
    expect(validateVerificationSubmission("GIS-100", true)).toBeNull();
  });
  it("requires a photo", () => {
    expect(validateVerificationSubmission("GIS-100", false)).not.toBeNull();
  });
  it("allows only Super Admins to approve other staff", () => {
    expect(canReviewVerification("admin", "reviewer", "staff", "pending", "approved")).toBe(true);
    for (const role of ["staff", "oic", "2ic", "staff_officer", null]) {
      expect(canReviewVerification(role, "reviewer", "staff", "pending", "approved")).toBe(false);
    }
  });
  it("prevents self approval", () => {
    expect(canReviewVerification("admin", "same", "same", "pending", "approved")).toBe(false);
  });
  it("prevents repeated decisions", () => {
    expect(canReviewVerification("admin", "reviewer", "staff", "approved", "approved")).toBe(false);
    expect(canReviewVerification("admin", "reviewer", "staff", "rejected", "approved")).toBe(false);
  });
  it("permits revocation only after approval", () => {
    expect(canReviewVerification("admin", "reviewer", "staff", "approved", "revoked")).toBe(true);
    expect(canReviewVerification("admin", "reviewer", "staff", "pending", "revoked")).toBe(false);
  });
});