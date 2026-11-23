import { describe, expect, it } from "vitest";
import { canAccessModule } from "@/lib/rbac";
import { payrollAmounts, payrollTotals, validateTrainingDates, type PayrollRow } from "@/lib/admin-hr";

describe("personnel administration role limits", () => {
  it("allows Super Admins all three screens", () => {
    for (const key of ["payroll-admin", "training-admin", "performance-admin"]) expect(canAccessModule(key, { role: "admin" })).toBe(true);
  });
  it("denies ordinary staff even with an administration grant", () => {
    for (const key of ["payroll-admin", "training-admin", "performance-admin"]) expect(canAccessModule(key, { role: "staff", capabilities: [key] })).toBe(false);
  });
  it("requires an explicit payroll grant for command heads", () => {
    expect(canAccessModule("payroll-admin", { role: "oic" })).toBe(false);
    expect(canAccessModule("payroll-admin", { role: "2ic", capabilities: ["*"] })).toBe(false);
    expect(canAccessModule("payroll-admin", { role: "oic", capabilities: ["payroll-admin"] })).toBe(true);
  });
  it("allows command heads training and review administration", () => {
    for (const key of ["training-admin", "performance-admin"]) {
      expect(canAccessModule(key, { role: "oic" })).toBe(true);
      expect(canAccessModule(key, { role: "2ic" })).toBe(true);
    }
  });
  it("requires exact grants for Staff Officers", () => {
    expect(canAccessModule("training-admin", { role: "staff_officer", capabilities: ["*"] })).toBe(false);
    expect(canAccessModule("training-admin", { role: "staff_officer", capabilities: ["training-admin"] })).toBe(true);
  });
  it("does not grant Heads of Administration command-tier access", () => {
    expect(canAccessModule("training-admin", { role: "head_of_administration" })).toBe(false);
  });
});
describe("monthly records validation", () => {
  it("calculates net from manually recorded amounts", () => expect(payrollAmounts(1250, 250)).toBe(1000));
  it("rejects deductions exceeding gross pay", () => expect(() => payrollAmounts(100, 101)).toThrow());
  it("keeps currencies separate and excludes voided financial records", () => {
    const row = (currency: string, status: string): PayrollRow => ({ id: currency + status, profile_id: "p", pay_month: "2026-11-01", gross_pay: 100, deductions: 25, net_pay: 75, currency, reference: "ref", notes: "", status, revision: 1 });
    expect(payrollTotals([row("GHS", "recorded"), row("USD", "recorded"), row("GHS", "void")])).toEqual([{ currency: "GHS", gross: 100, deductions: 25, net: 75 }, { currency: "USD", gross: 100, deductions: 25, net: 75 }]);
  });
  it("rejects expiry before completion", () => expect(() => validateTrainingDates("2026-11-23", "2026-11-22")).toThrow());
  it("accepts training without an expiry", () => expect(() => validateTrainingDates("2026-11-23", "")).not.toThrow());
});