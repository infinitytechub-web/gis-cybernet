import { describe, it, expect } from "vitest";
import { ENTERPRISE_BRANDS, brandToCssVars, contrastRatio, validateBrandTokens } from "@/lib/brands";

describe("ALFA and BETA enterprise themes", () => {
  it("ALFA has deep green primary, white secondary and gold accent", () => {
    expect(ENTERPRISE_BRANDS.ALFA.primary).toBe("152 65% 22%");
    expect(ENTERPRISE_BRANDS.ALFA.secondary).toBe("0 0% 100%");
    expect(ENTERPRISE_BRANDS.ALFA.accent).toBe("43 74% 45%");
  });
  it("BETA adds navy without changing primary, white surfaces or gold", () => {
    expect(ENTERPRISE_BRANDS.BETA.secondary).toBe("220 80% 18%");
    expect(ENTERPRISE_BRANDS.BETA.primary).toBe(ENTERPRISE_BRANDS.ALFA.primary);
    expect(ENTERPRISE_BRANDS.BETA.surface).toBe("0 0% 100%");
    expect(ENTERPRISE_BRANDS.BETA.accent).toBe(ENTERPRISE_BRANDS.ALFA.accent);
  });
  for (const [name, tokens] of Object.entries(ENTERPRISE_BRANDS)) {
    for (const mode of ["light", "dark"] as const) {
      it(`${name} ${mode} keeps readable content, navigation and status colours`, () => {
        expect(validateBrandTokens(tokens)).toBeNull();
        const vars = brandToCssVars(tokens, mode);
        for (const role of ["primary", "secondary", "card", "popover", "muted", "accent", "success", "warning", "destructive", "sidebar-primary", "sidebar-accent"]) {
          expect(contrastRatio(vars[`--${role}`], vars[`--${role}-foreground`])).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(vars["--sidebar-background"], vars["--sidebar-foreground"])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(vars["--background-sky"], vars["--foreground"])).toBeGreaterThanOrEqual(4.5);
        expect(vars["--sidebar-primary"]).toBe(tokens.accent);
      });
    }
  }
});