import { describe, it, expect } from "vitest";
import { descendantUnits } from "@/components/hr/CustomRolesManager";

const units = [
  { id: "A", parent_id: null }, { id: "A1", parent_id: "A" }, { id: "A1a", parent_id: "A1" },
  { id: "B", parent_id: null }, { id: "B1", parent_id: "B" },
];
describe("command role eligibility", () => {
  it("a command role covers the command and every station beneath it", () => {
    expect(descendantUnits("A", units).sort()).toEqual(["A", "A1", "A1a"]);
  });
  it("officers in another command are not eligible", () => {
    expect(descendantUnits("A", units)).not.toContain("B1");
  });
});
