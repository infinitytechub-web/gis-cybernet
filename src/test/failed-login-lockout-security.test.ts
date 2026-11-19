// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/migrations/0104_failed_login_audit_without_account_lockout.sql", "utf8");
describe("untrusted failed login attempts", () => {
  it("records failures without changing account access or creating lockout events", () => {
    expect(migration).toContain("INSERT INTO public.failed_login_attempts");
    expect(migration).not.toMatch(/UPDATE\s+public\.profiles/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.account_lockout_events/i);
    expect(migration).toContain("'locked', false");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });
  it("enforces persisted locks without deriving or expiring them from failures", () => {
    const lockFunction = migration.split("CREATE OR REPLACE FUNCTION public.is_staff_locked")[1].split("$function$;")[0];
    expect(lockFunction).toContain("SELECT account_locked FROM public.profiles");
    expect(lockFunction).not.toContain("failed_login_attempts");
    expect(lockFunction).not.toContain("lockout_auto_unlock_minutes");
  });
  it("does not display a misleading failure-count lockout warning", () => {
    const login = readFileSync("src/pages/Login.tsx", "utf8");
    expect(login).not.toContain("remaining before lockout");
    expect(login).toContain("if (lookup?.locked)");
    expect(login).toContain("Contact an administrator to unlock this account.");
  });
});