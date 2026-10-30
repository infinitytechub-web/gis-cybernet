import { describe, it, expect } from "vitest";
import { reorder, splitCommandName, commandDashboardPath, regionalCardPath } from "@/lib/regional-commands";
import { canAccessModule } from "@/lib/rbac";
import { brandToCssVars, validateBrandTokens, hexToHsl, hslToHex } from "@/lib/brands";

const brand2 = { primary: "152 65% 22%", secondary: "43 74% 45%", accent: "155 55% 45%", background: "150 30% 97%", surface: "0 0% 100%", text: "155 45% 10%", border: "150 25% 85%", success: "145 60% 32%", warning: "40 90% 45%", danger: "0 75% 45%" };

describe("regional command cards", () => {
  const card = { id: "own", name: "Own command", type: "regional", activation_status: "active" as const, display_order: 1, brand_color: null, staff_count: null, is_own: true, can_open: true };
  it("ordinary officers open their portal without gaining analytics access", () => {
    const canAnalytics = canAccessModule("command-analytics", { role: "staff" });
    expect(canAnalytics).toBe(false);
    expect(regionalCardPath(card, canAnalytics)).toBe("/portal");
    expect(canAccessModule("staff-portal", { role: "staff" })).toBe(true);
  });
  it("authorized analytics users retain the exact command destination", () => {
    expect(regionalCardPath(card, canAccessModule("command-analytics", { role: "admin" }))).toBe("/command-analytics/own");
  });
  it("cannot open a pending or another command through the portal fallback", () => {
    expect(regionalCardPath({ ...card, can_open: false }, true)).toBeNull();
    expect(regionalCardPath({ ...card, is_own: false }, false)).toBeNull();
  });
  it("reorder changes only order, keeping every card and its fields", () => {
    const list = [{ id: "a", parent: "hq" }, { id: "b", parent: "hq" }, { id: "c", parent: "hq" }];
    const next = reorder(list, "c", "a");
    expect(next.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(next.every((x) => x.parent === "hq")).toBe(true);
  });
  it("splits names like the card design", () => {
    expect(splitCommandName("Greater Accra Regional Command")).toEqual({ title: "Greater Accra", subtitle: "Regional Command" });
    expect(splitCommandName("National Headquarters").title).toBe("National Headquarters");
  });
  it("opens the existing command dashboard", () => {
    expect(commandDashboardPath("x1")).toBe("/command-analytics/x1");
  });
});

describe("brands", () => {
  it("Brand 2 passes validation and drives shared tokens", () => {
    expect(validateBrandTokens(brand2)).toBeNull();
    const v = brandToCssVars(brand2);
    expect(v["--primary"]).toBe("152 65% 22%");
    expect(v["--secondary"]).toBe("43 74% 45%");
    expect(v["--destructive"]).toBe("0 75% 45%");
  });
  it("rejects missing or malformed colours", () => {
    expect(validateBrandTokens({ ...brand2, danger: "red" })).toMatch(/Danger/);
  });
  it("hex <-> hsl round trip", () => {
    expect(hslToHex(hexToHsl("#ffffff"))).toBe("#ffffff");
  });
});
