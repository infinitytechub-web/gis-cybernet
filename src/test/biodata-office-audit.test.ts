import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0055_biodata_office_audit_formats.sql", "utf8");
describe("Bio-Data office download audit", () => {
  it("records Word as the actual DOCX format", () => {
    expect(sql).toMatch(/WHEN 'word' THEN 'docx'/);
    expect(sql).toMatch(/CHECK \(format IN \([^)]*'docx'/);
  });
  it("records Excel as the actual XLSX format", () => {
    expect(sql).toMatch(/WHEN 'excel' THEN 'xlsx'/);
    expect(sql).toMatch(/CHECK \(format IN \([^)]*'xlsx'/);
  });
  it("retains server authorization and rejects deleted records", () => {
    expect(sql).toContain("public.can_access_staff_profile(auth.uid(),_profile_id)");
    expect(sql).toContain("deleted_at IS NULL");
  });
});