import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAFF_ID_MASK_RULES,
  applyStaffIdPattern,
  maskStaffId,
  normalizeStaffIdMaskRules,
  resolveStaffIdPattern,
  REDACTED_ID,
  type StaffIdMaskRules,
} from "@/lib/staff-id-mask";

const ID = "GIS-004521";

describe("configurable employee ID anonymisation", () => {
  it("keeps the shipped default: admin tier full, everyone else partial", () => {
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "admin" })).toBe(ID);
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "oic" })).toBe(ID);
    const masked = maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "staff" });
    expect(masked).toBe("GIS•••••21");
    expect(masked).not.toContain("0045");
  });

  it("applies context rules for non-privileged viewers only", () => {
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "staff", context: "export" })).toBe("••••••••21");
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "admin", context: "export" })).toBe(ID);
  });

  it("resolves most specific first: role+context > role > full role > context > default", () => {
    const rules: StaffIdMaskRules = normalizeStaffIdMaskRules({
      full_roles: ["admin"],
      default: { mode: "partial", head: 3, tail: 2, char: "•" },
      role_overrides: {
        supervisor: { mode: "partial", head: 2, tail: 4, char: "*" },
        "supervisor:export": { mode: "hidden" },
        "admin:print": { mode: "hidden" },
      },
      context_overrides: { print: { mode: "hidden" } },
    });

    expect(maskStaffId(ID, rules, { role: "supervisor" })).toBe("GI****4521");
    expect(maskStaffId(ID, rules, { role: "supervisor", context: "export" })).toBe(REDACTED_ID);
    // A role+context rule can even tighten a full-access role.
    expect(maskStaffId(ID, rules, { role: "admin", context: "print" })).toBe(REDACTED_ID);
    expect(maskStaffId(ID, rules, { role: "admin", context: "dashboard" })).toBe(ID);
    expect(maskStaffId(ID, rules, { role: "staff", context: "print" })).toBe(REDACTED_ID);
    expect(maskStaffId(ID, rules, { role: "staff", context: "directory" })).toBe("GIS•••••21");
  });

  it("honours owner and identity-grant exemptions, and the owner toggle", () => {
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "staff", isOwner: true })).toBe(ID);
    expect(maskStaffId(ID, DEFAULT_STAFF_ID_MASK_RULES, { role: "staff", hasIdentityGrant: true })).toBe(ID);
    const strict = normalizeStaffIdMaskRules({ ...DEFAULT_STAFF_ID_MASK_RULES, owner_sees_full: false });
    expect(maskStaffId(ID, strict, { role: "staff", isOwner: true })).toBe("GIS•••••21");
  });

  it("never leaks the identifier through a mask and redacts short values", () => {
    const pattern = { mode: "partial" as const, head: 3, tail: 2, char: "•" };
    expect(applyStaffIdPattern("GIS-004521", pattern)).not.toContain("4521");
    expect(applyStaffIdPattern("A12", pattern)).toBe(REDACTED_ID);
    expect(applyStaffIdPattern("", pattern)).toBe("—");
    expect(applyStaffIdPattern(ID, { mode: "hidden", head: 3, tail: 2, char: "•" })).toBe(REDACTED_ID);
  });

  it("repairs malformed stored rules instead of failing open", () => {
    const rules = normalizeStaffIdMaskRules({
      full_roles: "admin",
      default: { mode: "nonsense", head: 99, tail: -5, char: "long" },
      role_overrides: null,
    });
    expect(rules.full_roles).toEqual(DEFAULT_STAFF_ID_MASK_RULES.full_roles);
    expect(rules.default.mode).toBe("partial");
    expect(rules.default.head).toBe(8);
    expect(rules.default.tail).toBe(0);
    expect(rules.default.char).toBe("•");
    expect(resolveStaffIdPattern(normalizeStaffIdMaskRules(undefined), { role: "staff" }).mode).toBe("partial");
  });
});
