import { describe, it, expect } from "vitest";
import { buildKycRows, maskValue } from "@/lib/hrm-kyc-export";
import { commandRootOf } from "@/components/portal/MyCommandSection";

describe("KYC export", () => {
  const p = { staff_id: "GIS-001", last_name: "MENSAH", ghana_card_number: "GHA-123456789-0", date_of_birth: "1990-05-04" };

  it("masks restricted fields for roles without full access", () => {
    const { rows } = buildKycRows([p], ["staff_id", "ghana_card_number"], false);
    expect(rows[0]).toEqual(["GIS-001", maskValue("GHA-123456789-0")]);
    expect(rows[0][1].endsWith("-0")).toBe(true);
    expect(rows[0][1]).not.toContain("123456789");
  });

  it("shows restricted fields to permitted roles and formats dates DD/MM/YYYY", () => {
    const { headers, rows } = buildKycRows([p], ["ghana_card_number", "date_of_birth"], true);
    expect(headers).toEqual(["Date of birth", "Ghana Card number"]);
    expect(rows[0]).toEqual(["04/05/1990", "GHA-123456789-0"]);
  });

  it("masks per officer when access is decided by rank", () => {
    const junior = { id: "j", ghana_card_number: "GHA-111111111-1" };
    const senior = { id: "s", ghana_card_number: "GHA-222222222-2" };
    const { rows } = buildKycRows([junior, senior], ["ghana_card_number"], (p) => p.id === "j");
    expect(rows[0][0]).toBe("GHA-111111111-1");
    expect(rows[1][0]).not.toContain("222222222");
  });

  it("includes only the chosen fields", () => {
    const { headers } = buildKycRows([p], ["last_name"], true);
    expect(headers).toEqual(["Last name"]);
  });
});

describe("officer command root", () => {
  const units = [
    { id: "hq", name: "HQ", type: "national", parent_id: null, is_active: true },
    { id: "r", name: "Greater Accra", type: "regional", parent_id: "hq", is_active: true },
    { id: "s", name: "Sector", type: "sector", parent_id: "r", is_active: true },
    { id: "st", name: "Station", type: "station", parent_id: "s", is_active: true },
  ];
  it("resolves a station officer to their regional command", () => {
    expect(commandRootOf(units, "st")?.id).toBe("r");
  });
  it("returns null when unassigned", () => {
    expect(commandRootOf(units, null)).toBeNull();
  });
});
