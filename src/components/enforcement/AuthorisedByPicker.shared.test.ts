import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cross-module guarantee: Enforcement and Operations both consume the SAME
 * `AuthorisedByPicker` component. Because of that, the keyboard-navigation,
 * empty-results, and Supabase query-error behaviours covered by
 * `AuthorisedByPicker.test.tsx` apply identically to both forms.
 *
 * If either page ever swaps in a different picker implementation, this test
 * will fail loudly and the empty/error coverage must be re-added there.
 */
const SHARED_IMPORT = `from "@/components/enforcement/AuthorisedByPicker"`;

const readPage = (rel: string) =>
  readFileSync(resolve(__dirname, "../../pages", rel), "utf8");

describe("AuthorisedByPicker — shared across Enforcement & Operations", () => {
  it("Enforcement.tsx imports the shared AuthorisedByPicker", () => {
    expect(readPage("Enforcement.tsx")).toContain(SHARED_IMPORT);
  });

  it("Operations.tsx imports the shared AuthorisedByPicker", () => {
    expect(readPage("Operations.tsx")).toContain(SHARED_IMPORT);
  });

  it("both pages render <AuthorisedByPicker /> in their forms", () => {
    expect(readPage("Enforcement.tsx")).toMatch(/<AuthorisedByPicker[\s>]/);
    expect(readPage("Operations.tsx")).toMatch(/<AuthorisedByPicker[\s>]/);
  });
});
