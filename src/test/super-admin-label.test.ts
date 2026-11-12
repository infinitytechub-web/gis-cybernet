import { describe, it, expect } from "vitest";
import { canAccessModule, MODULES } from "@/lib/rbac";
describe("Super Admin", () => {
  it("is allowed into every module without a command posting", () => {
    for (const m of MODULES) expect(canAccessModule(m.key, { role: "admin" })).toBe(true);
  });
  it("plain staff are not", () => {
    expect(MODULES.some((m) => !canAccessModule(m.key, { role: "staff" }))).toBe(true);
  });
});
