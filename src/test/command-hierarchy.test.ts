import { describe, expect, it } from "vitest";
import {
  buildCommandsWordHtml,
  buildHierarchyTree,
  buildHierarchyWordHtml,
  flattenedIds,
  moveWithinSiblings,
  subtreeAt,
  visibleNodes,
  type HierarchyUnit,
} from "@/lib/command-hierarchy";
import type { RegionalCommandCard } from "@/lib/regional-commands";

const unit = (id: string, name: string, parent_id: string | null, type: HierarchyUnit["type"], display_order: number | null): HierarchyUnit => ({
  id, name, code: id.toUpperCase(), type, parent_id, is_active: true, display_order, activation_status: "active", brand_color: null,
});

const UNITS: HierarchyUnit[] = [
  unit("hq", "National Headquarters", null, "national", 1),
  unit("ga", "Greater Accra Regional Command", "hq", "regional", 3),
  unit("ar", "Ashanti Regional Command", "hq", "regional", 2),
  unit("ama", "Amasaman Sector Command", "ga", "sector", 1),
];

describe("buildHierarchyTree", () => {
  it("nests children under parents and orders siblings by display order", () => {
    const roots = buildHierarchyTree(UNITS);
    expect(roots.map((n) => n.id)).toEqual(["hq"]);
    expect(roots[0].children.map((n) => n.id)).toEqual(["ar", "ga"]);
    expect(roots[0].children[1].children.map((n) => n.id)).toEqual(["ama"]);
    expect(roots[0].children[1].depth).toBe(1);
  });

  it("flattenedIds is depth-first and covers every unit once", () => {
    expect(flattenedIds(buildHierarchyTree(UNITS))).toEqual(["hq", "ar", "ga", "ama"]);
  });
});

describe("moveWithinSiblings", () => {
  it("reorders siblings within the same parent", () => {
    const roots = buildHierarchyTree(UNITS);
    const next = moveWithinSiblings(roots, "ar", "ga");
    expect(next).not.toBeNull();
    expect(next![0].children.map((n) => n.id)).toEqual(["ga", "ar"]);
    expect(flattenedIds(next!)).toEqual(["hq", "ga", "ama", "ar"]);
  });

  it("refuses to move a node under a different parent (reporting lines never change)", () => {
    const roots = buildHierarchyTree(UNITS);
    expect(moveWithinSiblings(roots, "ama", "ar")).toBeNull();
    expect(moveWithinSiblings(roots, "ga", "ama")).toBeNull();
    expect(moveWithinSiblings(roots, "hq", "ar")).toBeNull();
  });
});

describe("visibleNodes", () => {
  it("hides descendants of collapsed nodes", () => {
    const roots = buildHierarchyTree(UNITS);
    expect(visibleNodes(roots, new Set()).map((n) => n.id)).toEqual(["hq", "ar", "ga", "ama"]);
    expect(visibleNodes(roots, new Set(["ga"])).map((n) => n.id)).toEqual(["hq", "ar", "ga"]);
    expect(visibleNodes(roots, new Set(["hq"])).map((n) => n.id)).toEqual(["hq"]);
  });
});

describe("Word export", () => {
  const cards: RegionalCommandCard[] = [
    { id: "1", name: "National Headquarters", type: "national", activation_status: "active", display_order: 1, brand_color: null, staff_count: 120, is_own: false, can_open: true },
    { id: "2", name: "Volta <Regional> Command & Co", type: "regional", activation_status: "pending", display_order: 2, brand_color: null, staff_count: null, is_own: true, can_open: false },
  ];

  it("lists every card with status and escapes HTML", () => {
    const html = buildCommandsWordHtml(cards, new Date("2026-10-28T12:00:00Z"));
    expect(html).toContain("REGIONAL COMMANDS LIST");
    expect(html).toContain("National Headquarters");
    expect(html).toContain("Volta &lt;Regional&gt; Command &amp; Co");
    expect(html).toContain("Pending activation");
    expect(html).toContain("120");
    expect(html).not.toContain("<Regional>");
  });

  it("hierarchy export indents children and labels types", () => {
    const html = buildHierarchyWordHtml(buildHierarchyTree(UNITS), new Date("2026-10-28T12:00:00Z"));
    expect(html).toContain("COMMAND HIERARCHY");
    expect(html).toContain("Regional Command");
    expect(html).toContain("Amasaman Sector Command");
    expect(html.indexOf("Ashanti")).toBeLessThan(html.indexOf("Greater Accra"));
  });
});
