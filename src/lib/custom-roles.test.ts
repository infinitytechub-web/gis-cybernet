import { describe, it, expect } from "vitest";
import { allowedBaseRoles } from "./custom-roles";
const all = ["admin", "oic", "2ic", "staff_officer", "supervisor", "staff"];
describe("custom role permission levels", () => {
  it("command tier cannot base a role on admin, OIC or 2IC", () => expect(allowedBaseRoles(all, false)).toEqual(["staff_officer", "supervisor", "staff"]));
  it("Super Admin can use every level", () => expect(allowedBaseRoles(all, true)).toEqual(all));
});
