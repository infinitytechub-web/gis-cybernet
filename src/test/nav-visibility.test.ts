import { describe, it, expect } from "vitest";
import { showInNav } from "@/lib/nav-visibility";
import { canAccessPath } from "@/lib/rbac";

const can = (role: any) => (p: string) => canAccessPath(p, { role });

describe("sidebar role visibility", () => {
  it("plain staff do not see management areas outside My Work", () => {
    for (const p of ["/directory", "/command-dashboard", "/regional-commands", "/admin", "/hr/overview", "/leave/calendar"]) {
      expect(showInNav(p, "managed", "staff", can("staff"))).toBe(false);
    }
  });
  it("plain staff keep self-service items in My Work", () => {
    for (const p of ["/", "/leave", "/payments", "/staff-vault", "/my-portal"]) {
      expect(showInNav(p, "self", "staff", can("staff"))).toBe(true);
    }
  });
  it("command heads still see command pages", () => {
    expect(showInNav("/command-dashboard", "managed", "oic", can("oic"))).toBe(true);
  });
});
