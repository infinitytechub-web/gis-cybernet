// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderBailTemplate, sanitizeBailPrintHtml } from "@/lib/bail-print-templates";
import { csvCellQuoted } from "@/lib/csv-safe";

describe("selected security fixes", () => {
  it("removes active content from new and archived bail printouts", () => {
    const attack = '<h2>Form</h2><script>alert(1)</script><img src="x" onerror="alert(1)"><iframe srcdoc="bad"></iframe><a href="javascript:alert(1)">Link</a>';
    for (const html of [sanitizeBailPrintHtml(attack), renderBailTemplate(attack, {})]) {
      expect(html).toContain("Form");
      expect(html).not.toMatch(/<script|onerror|<iframe|javascript:/i);
    }
  });
  it("keeps printable tables, placeholder values and styles", () => {
    const html = renderBailTemplate('<style>table{width:100%}</style><table><tr><td>{{name}}</td></tr></table>', { name: "OFFICER" });
    expect(html).toContain("OFFICER");
    expect(html).toContain("<table>");
    expect(html).toContain("width:100%");
  });
  it("both command exports neutralize formulas and preserve quoting", () => {
    for (const name of ["CommandDashboard", "CommandPortal"]) {
      expect(readFileSync(`src/pages/${name}.tsx`, "utf8")).toContain("r.map(csvCellQuoted)");
    }
    for (const value of ["=HYPERLINK(\"bad\")", "+cmd", "-cmd", "@SUM(A1)", "\tformula", "\rformula"]) {
      expect(csvCellQuoted(value)).toMatch(/^"'/);
    }
  });
  it("public recovery never locks the named account", () => {
    const source = readFileSync("supabase/functions/admin-recovery/index.ts", "utf8");
    expect(source).not.toContain("account_locked: true");
    expect(source).toContain("return json(429");
  });
  it("scanner checks object ownership and refuses changed paths", () => {
    const source = readFileSync("supabase/functions/scan-upload/index.ts", "utf8");
    expect(source.indexOf("object?.owner_id !== u.user.id")).toBeLessThan(source.indexOf('.download(path)'));
    expect(source).toContain('.eq(t.path, path)');
    expect(source).toContain('if (updateError || !updated)');
  });
  it("personal clock does not directly insert attendance or supply timestamps", () => {
    const source = readFileSync("src/components/attendance/CheckInOut.tsx", "utf8");
    expect(source).not.toContain('.from("attendances").insert');
    expect(source.match(/rpc\("self_attendance_clock"/g)).toHaveLength(2);
    expect(source).toContain("_token_hash: verified.tokenHash");
  });
});