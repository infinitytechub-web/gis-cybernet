import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODULES, canAccessModule, canAccessPath } from "@/lib/rbac";

const appSrc = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

/** Every `<Route path="..." element={<ProtectedRoute ...` in App.tsx. */
function protectedRoutes(): Array<{ path: string; module?: string }> {
  const out: Array<{ path: string; module?: string }> = [];
  for (const m of appSrc.matchAll(
    /<Route path="([^"]+)" element=\{<ProtectedRoute(\s+module="([^"]+)")?/g,
  )) {
    out.push({ path: m[1], module: m[3] });
  }
  return out;
}

describe("RBAC registry", () => {
  it("declares a module on every protected route", () => {
    const missing = protectedRoutes().filter((r) => !r.module).map((r) => r.path);
    expect(missing, `routes without an RBAC module: ${missing.join(", ")}`).toEqual([]);
  });

  it("only references module keys that exist in the registry", () => {
    const keys = new Set(MODULES.map((m) => m.key));
    const unknown = protectedRoutes().filter((r) => r.module && !keys.has(r.module));
    expect(unknown.map((r) => `${r.path} -> ${r.module}`)).toEqual([]);
  });

  it("has unique module keys and no duplicated route paths", () => {
    const keys = MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    const paths = MODULES.flatMap((m) => m.paths);
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("access decisions", () => {
  const staff = { role: "staff" as const };
  const admin = { role: "admin" as const };

  it("denies unauthenticated / roleless users", () => {
    expect(canAccessModule("dashboard", { role: null })).toBe(false);
  });

  it("always allows System Administrators", () => {
    for (const m of MODULES) expect(canAccessModule(m.key, admin)).toBe(true);
  });

  it("allows all-staff modules but denies command/admin modules to plain staff", () => {
    expect(canAccessPath("/dashboard", staff)).toBe(true);
    expect(canAccessPath("/my-profile", staff)).toBe(true);
    for (const p of ["/admin", "/command-roles", "/settings", "/ip-blocks", "/audit-log", "/recycle-bin"]) {
      expect(canAccessPath(p, staff), `${p} must be denied to staff`).toBe(false);
    }
  });

  it("honours an admin matrix override that denies a role", () => {
    const mod = MODULES.find(
      (m) => m.feature && m.roles !== "all" && (m.roles as string[]).some((r) => r !== "admin"),
    )!;
    const role = (mod.roles as string[]).find((r) => r !== "admin")!;

    expect(canAccessModule(mod.key, { role: role as never })).toBe(true);
    expect(
      canAccessModule(mod.key, {
        role: role as never,
        overrides: { [`${mod.feature}::${role}`]: "none" },
      }),
    ).toBe(false);
  });

  it("honours a delegated capability grant and the wildcard", () => {
    expect(canAccessModule("audit-log", staff)).toBe(false);
    expect(canAccessModule("audit-log", { ...staff, capabilities: ["audit-log"] })).toBe(true);
    expect(canAccessModule("audit-log", { ...staff, capabilities: ["*"] })).toBe(true);
  });

  it("matches parameterised routes", () => {
    expect(canAccessPath("/staff/123", admin)).toBe(true);
    expect(canAccessPath("/staff/123", staff)).toBe(canAccessModule("staff", staff));
  });
});

describe("least privilege — audit-sensitive modules", () => {
  const SENSITIVE = [
    "audit-log",
    "command-role-audit",
    "shift-window-audit",
    "rum-analytics",
    "session-management",
    "admin-access-matrix",
    "sensitive-access-log",
    "ip-blocks",
    "settings",
    "branding",
    "retention-policy",
  ];

  it("restricts audit/security modules to the administration tier", () => {
    for (const key of SENSITIVE) {
      expect(canAccessModule(key, { role: "staff" }), key).toBe(false);
      expect(canAccessModule(key, { role: "supervisor" }), key).toBe(false);
      expect(canAccessModule(key, { role: "staff_officer" }), key).toBe(false);
      expect(canAccessModule(key, { role: "admin" }), key).toBe(true);
    }
  });

  it("no longer exposes unit oversight or in-cab comms to every staff member", () => {
    expect(canAccessModule("unit-dashboard", { role: "staff" })).toBe(false);
    expect(canAccessModule("in-cab", { role: "staff" })).toBe(false);
    expect(canAccessModule("unit-dashboard", { role: "supervisor" })).toBe(true);
    expect(canAccessModule("in-cab", { role: "shift_leader" })).toBe(true);
  });

  it("keeps all-staff modules limited to personal / informational surfaces", () => {
    const allowed = new Set([
      "dashboard", "my-profile", "my-portal", "my-shift", "staff-directory",
      "excuse-duty", "leave", "attendance", "holidays", "announcements",
      "quarantine", "appraisals", "verify-export", "change-password",
      "payments", "loans", "biometric-enrollment",
    ]);
    const unexpected = MODULES.filter((m) => m.roles === "all" && !allowed.has(m.key)).map((m) => m.key);
    expect(unexpected, `modules open to everyone: ${unexpected.join(", ")}`).toEqual([]);
  });
});


describe("Command Officer role", () => {
  const co = { role: "command_officer" as const };
  const supervisor = { role: "supervisor" as const };

  it("can open the Command Console", () => {
    expect(canAccessModule("command-console", co)).toBe(true);
    expect(canAccessPath("/command-console", co)).toBe(true);
  });

  it("matches the existing command tier on every command module", () => {
    for (const m of MODULES.filter((m) => m.tier === "command")) {
      expect(canAccessModule(m.key, co), `${m.key}`).toBe(canAccessModule(m.key, supervisor));
    }
  });

  it("is not granted admin-only modules", () => {
    for (const m of MODULES.filter((m) => m.tier === "admin")) {
      expect(canAccessModule(m.key, co), `${m.key} must stay admin-only`).toBe(false);
    }
  });
});
