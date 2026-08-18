import { describe, it, expect } from "vitest";
import {
  validateGhanaPhone,
  validateGhanaPhoneList,
  normalizeGhanaPhone,
  formatGhanaPhone,
  isValidGhanaPhone,
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
    const ok = validateGhanaPhoneList("0241234567, +233201234567");
    expect(ok.valid).toBe(true);
    const bad = validateGhanaPhoneList("0241234567, 0221234567");
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
