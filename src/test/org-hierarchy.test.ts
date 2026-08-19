import { describe, it, expect } from "vitest";
import {
  ancestorIds,
  buildOrgTree,
  descendantIds,
  filterByOrgScope,
  flattenOrgTree,
  orgUnitPath,
  resolveOrgScope,
  type OrgUnit,
} from "@/lib/org-hierarchy";
import { MODULES_BY_KEY } from "@/lib/rbac";

const units: OrgUnit[] = [
  { id: "nhq", name: "National HQ", code: "NHQ", type: "national", parent_id: null, is_active: true },
  { id: "gar", name: "Greater Accra Regional Command", code: "GAR", type: "regional", parent_id: "nhq", is_active: true },
  { id: "ash", name: "Ashanti Regional Command", code: "ASH", type: "regional", parent_id: "nhq", is_active: true },
  { id: "ams", name: "Amasaman Sector Command", code: "GAR-AMS", type: "sector", parent_id: "gar", is_active: true },
  { id: "fd", name: "Front Desk", code: "GAR-AMS-FD", type: "unit", parent_id: "ams", is_active: true },
  { id: "op", name: "Operations", code: "GAR-AMS-OP", type: "unit", parent_id: "ams", is_active: true },
  { id: "kum", name: "Kumasi Sector Command", code: "ASH-KUM", type: "sector", parent_id: "ash", is_active: true },
];

describe("org hierarchy tree", () => {
  it("nests units under their parent and orders by level", () => {
    const tree = buildOrgTree(units);
    expect(tree.map((n) => n.id)).toEqual(["nhq"]);
    const flat = flattenOrgTree(tree);
    expect(flat.find((n) => n.id === "fd")!.depth).toBe(3);
  });

  it("resolves descendants, ancestors and command paths", () => {
    expect(descendantIds(units, "gar").sort()).toEqual(["ams", "fd", "gar", "op"]);
    expect(ancestorIds(units, "fd")).toEqual(["fd", "ams", "gar", "nhq"]);
    expect(orgUnitPath(units, "fd")).toBe(
      "National HQ › Greater Accra Regional Command › Amasaman Sector Command › Front Desk",
    );
  });
});

describe("hierarchical scope", () => {
  it("gives a regional command its own branch only", () => {
    const scope = resolveOrgScope({ isAdmin: false, homeUnitId: "gar", assignments: [], units });
    expect(scope.hasAccess("ams")).toBe(true);
    expect(scope.hasAccess("fd")).toBe(true);
    expect(scope.hasAccess("ash")).toBe(false);
    expect(scope.hasAccess("kum")).toBe(false);
  });

  it("never grants upward access", () => {
    const scope = resolveOrgScope({ isAdmin: false, homeUnitId: "fd", assignments: [], units });
    expect(scope.hasAccess("fd")).toBe(true);
    expect(scope.hasAccess("ams")).toBe(false);
    expect(scope.hasAccess("nhq")).toBe(false);
  });

  it("adds delegated oversight branches and manage authority", () => {
    const scope = resolveOrgScope({
      isAdmin: false,
      homeUnitId: "fd",
      assignments: [{ org_unit_id: "kum", can_manage: true }],
      units,
    });
    expect(scope.hasAccess("kum")).toBe(true);
    expect(scope.canManage("kum")).toBe(true);
    expect(scope.canManage("fd")).toBe(false);
    expect(scope.canManage("ash")).toBe(false);
  });

  it("gives admins everything and flags unscoped users", () => {
    const admin = resolveOrgScope({ isAdmin: true, homeUnitId: null, assignments: [], units });
    expect(admin.hasAccess("kum")).toBe(true);
    expect(admin.canManage("nhq")).toBe(true);

    const none = resolveOrgScope({ isAdmin: false, homeUnitId: null, assignments: [], units });
    expect(none.unscoped).toBe(true);
    expect(none.hasAccess("kum")).toBe(false);
  });

  it("treats records without a posting as unrestricted (rollout-safe)", () => {
    const scope = resolveOrgScope({ isAdmin: false, homeUnitId: "fd", assignments: [], units });
    expect(scope.hasAccess(null)).toBe(true);
    expect(
      filterByOrgScope(
        [{ org_unit_id: "fd" }, { org_unit_id: "kum" }, { org_unit_id: null }],
        scope,
      ),
    ).toEqual([{ org_unit_id: "fd" }, { org_unit_id: null }]);
  });
});

describe("module registration", () => {
  it("registers the command structure page behind command-tier roles", () => {
    const mod = MODULES_BY_KEY["org-structure"];
    expect(mod).toBeDefined();
    expect(mod.paths).toContain("/org-structure");
    expect(mod.roles).toEqual(["admin", "oic", "2ic"]);
  });
});
