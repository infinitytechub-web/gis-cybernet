import { describe, it, expect } from "vitest";
import {
  validateGhanaPhone,
  validateGhanaPhoneList,
  normalizeGhanaPhone,
  formatGhanaPhone,
  isValidGhanaPhone,
  isSuspiciousGhanaPhone,
  assertGhanaPhoneList,
  validateContactPhone,
  isValidContactPhone,
  assertContactPhoneList,
} from "@/lib/ghana-phone";

describe("Ghana telephone validation", () => {
  it("detects each supported network from the prefix", () => {
    expect(validateGhanaPhone("0241234567").network).toBe("MTN");
    expect(validateGhanaPhone("0531234567").network).toBe("MTN");
    expect(validateGhanaPhone("0201234567").network).toBe("Telecel");
    expect(validateGhanaPhone("0501234567").network).toBe("Telecel");
    expect(validateGhanaPhone("0271234567").network).toBe("AirtelTigo");
    expect(validateGhanaPhone("0561234567").network).toBe("AirtelTigo");
  });

  it("accepts +233 / 233 / 00233 international forms and normalises to 10 digits", () => {
    expect(normalizeGhanaPhone("+233241234567")).toBe("0241234567");
    expect(normalizeGhanaPhone("233 24 123 4567")).toBe("0241234567");
    expect(normalizeGhanaPhone("00233241234567")).toBe("0241234567");
    expect(normalizeGhanaPhone("024-123-4567")).toBe("0241234567");
  });

  it("rejects wrong length and unknown networks", () => {
    expect(isValidGhanaPhone("024123456")).toBe(false); // 9 digits
    expect(isValidGhanaPhone("02412345678")).toBe(false); // 11 digits
    expect(isValidGhanaPhone("0221234567")).toBe(false); // unknown prefix
    expect(isValidGhanaPhone("")).toBe(false);
    expect(validateGhanaPhone("0221234567").error).toBeTruthy();
  });

  it("formats numbers for display", () => {
    expect(formatGhanaPhone("0241234567")).toBe("024 123 4567");
  });

  it("validates comma-separated lists and reports the offending entry", () => {
    const ok = validateGhanaPhoneList("0244857391, +233208461273");
    expect(ok.valid).toBe(true);
    const bad = validateGhanaPhoneList("0244857391, 0221234567");
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("flags fabricated / placeholder numbers as suspicious", () => {
    expect(isSuspiciousGhanaPhone("0241111111")).toBe(true);
    expect(isSuspiciousGhanaPhone("0240000000")).toBe(true);
    expect(isSuspiciousGhanaPhone("0241234567")).toBe(true);
    expect(isSuspiciousGhanaPhone("0247654321")).toBe(true);
    expect(isSuspiciousGhanaPhone("0241212123")).toBe(true);
    expect(isSuspiciousGhanaPhone("0244857391")).toBe(false);
    expect(validateGhanaPhoneList("0241111111").valid).toBe(false);
  });

  it("assertGhanaPhoneList canonicalises and rejects", () => {
    expect(assertGhanaPhoneList("+233 24 485 7391")).toBe("0244857391");
    expect(assertGhanaPhoneList("")).toBe("");
    expect(() => assertGhanaPhoneList("", "Phone", true)).toThrow();
    expect(() => assertGhanaPhoneList("0221234567")).toThrow();
    expect(() => assertGhanaPhoneList("0241111111")).toThrow();
  });
});

describe("contact phone validation (Ghana-strict, international-tolerant)", () => {
  it("accepts genuine Ghana numbers and canonicalises them", () => {
    expect(validateContactPhone("020 326 9678")).toMatchObject({ valid: true, kind: "ghana", canonical: "0203269678" });
    expect(validateContactPhone("+233 24 856 3902")).toMatchObject({ valid: true, kind: "ghana", canonical: "0248563902" });
  });

  it("rejects unlicensed prefixes, wrong lengths and forged Ghana patterns", () => {
    expect(isValidContactPhone("0211234567")).toBe(false);
    expect(isValidContactPhone("02003269678")).toBe(false);
    expect(isValidContactPhone("0241111111")).toBe(false);
    expect(isValidContactPhone("0241234567")).toBe(false);
  });

  it("accepts sanity-checked foreign numbers for non-Ghanaian applicants", () => {
    expect(validateContactPhone("+44 7700 900731")).toMatchObject({ valid: true, kind: "international", canonical: "+447700900731" });
    expect(isValidContactPhone("+2348012345670")).toBe(true);
    expect(isValidContactPhone("+1111111111")).toBe(false);
    expect(isValidContactPhone("+44 77")).toBe(false);
  });

  it("validates comma-separated lists and reports every bad entry", () => {
    expect(assertContactPhoneList("020 326 9678, +44 7700 900731")).toBe("0203269678, +447700900731");
    expect(() => assertContactPhoneList("0211234567", "Telephone")).toThrow(/Telephone/);
    expect(assertContactPhoneList("", "Telephone")).toBe("");
    expect(() => assertContactPhoneList("", "Telephone", true)).toThrow(/required/);
  });
});
