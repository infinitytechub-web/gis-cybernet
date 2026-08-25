import { describe, it, expect } from "vitest";
import {
  SENSITIVE_FIELDS,
  canSeeField,
  displayField,
  maskValue,
  type SensitiveField,
} from "@/lib/field-visibility";

const staff = { role: "staff" as const };
const supervisor = { role: "supervisor" as const };
const admin = { role: "admin" as const };
const medical = { role: "medical_officer" as const };
const store = { role: "storekeeper" as const };

const ALL = Object.keys(SENSITIVE_FIELDS) as SensitiveField[];

describe("field-level visibility", () => {
  it("denies every classified field to plain staff", () => {
    for (const f of ALL) expect(canSeeField(f, staff), f).toBe(false);
  });

  it("always allows the administration tier", () => {
    for (const f of ALL) {
      expect(canSeeField(f, admin), f).toBe(true);
      expect(canSeeField(f, { role: "oic" }), f).toBe(true);
      expect(canSeeField(f, { role: "2ic" }), f).toBe(true);
    }
  });

  it("always allows the record owner to see their own values", () => {
    for (const f of ALL) expect(canSeeField(f, { ...staff, isOwner: true }), f).toBe(true);
  });

  it("keeps medical data away from non-medical command roles", () => {
    expect(canSeeField("medical_record", supervisor)).toBe(false);
    expect(canSeeField("medical_diagnosis", supervisor)).toBe(false);
    expect(canSeeField("medical_record", medical)).toBe(true);
  });

  it("keeps financial data to procurement/stores and command", () => {
    expect(canSeeField("amount", staff)).toBe(false);
    expect(canSeeField("amount", store)).toBe(true);
    expect(canSeeField("budget", store)).toBe(false);
    expect(canSeeField("budget", supervisor)).toBe(true);
  });

  it("honours delegated field grants and the wildcard", () => {
    expect(canSeeField("ghana_card", { ...staff, capabilities: ["field:identity"] })).toBe(true);
    expect(canSeeField("ghana_card", { ...staff, capabilities: ["field:ghana_card"] })).toBe(true);
    expect(canSeeField("next_of_kin", { ...staff, capabilities: ["*"] })).toBe(true);
    expect(canSeeField("next_of_kin", { ...staff, capabilities: ["field:financial"] })).toBe(false);
  });

  it("never leaks the raw value through the mask", () => {
    expect(maskValue("phone", "0244123456")).not.toContain("3456");
    expect(maskValue("date_of_birth", "1990-05-04")).not.toContain("1990");
    expect(maskValue("next_of_kin", "Ama Mensah")).not.toContain("Ama");
    expect(maskValue("personal_email", "kofi.mensah@gmail.com")).not.toContain("kofi.mensah");
  });

  it("masks for unauthorized viewers and shows the value to authorized ones", () => {
    expect(displayField("phone", "0244123456", staff)).not.toBe("0244123456");
    expect(displayField("phone", "0244123456", admin)).toBe("0244123456");
    expect(displayField("phone", null, admin)).toBe("—");
  });

  it("denies everything when there is no role", () => {
    for (const f of ALL) expect(canSeeField(f, { role: null }), f).toBe(false);
  });

  it("partially masks employee IDs for general viewers only", () => {
    expect(displayField("staff_identifier", "GIS-004521", admin)).toBe("GIS-004521");
    const masked = displayField("staff_identifier", "GIS-004521", staff);
    expect(masked).toBe("GIS•••••21");
    expect(masked).not.toContain("0045");
    // Owners always see their own identifier.
    expect(displayField("staff_identifier", "GIS-004521", { ...staff, isOwner: true })).toBe("GIS-004521");
    // Masking is stable for the same input wherever it is rendered.
    expect(maskValue("staff_identifier", "GIS-004521")).toBe(masked);
  });
});
