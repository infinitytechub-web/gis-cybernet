import { describe, it, expect } from "vitest";
import { COMMAND_TIER_ROLES } from "@/lib/role-labels";

describe("command tier roles", () => {
  it("excludes Head of Administration", () => {
    expect(COMMAND_TIER_ROLES).not.toContain("head_of_administration");
  });
  it("keeps Chief Staff Officer", () => {
    expect(COMMAND_TIER_ROLES).toContain("chief_staff_officer");
  });
});
