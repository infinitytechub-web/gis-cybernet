import { describe, it, expect } from "vitest";
import { validateStaffVaultFile } from "@/lib/staff-vault";
describe("staff vault file rules", () => {
  it("accepts a PDF under 20 MB", () => { expect(validateStaffVaultFile({ name: "a.pdf", size: 1000 })).toBeNull(); });
  it("rejects files over 20 MB", () => { expect(validateStaffVaultFile({ name: "a.pdf", size: 20 * 1024 * 1024 + 1 })).not.toBeNull(); });
  it("rejects executables", () => { expect(validateStaffVaultFile({ name: "a.exe", size: 10 })).not.toBeNull(); });
});
