import { supabase } from "@/integrations/supabase/client";

export type AdminHrModule = "payroll-admin" | "training-admin" | "performance-admin";
export type AdminHrStaff = { id: string; first_name: string; last_name: string; org_unit_id: string | null; command_name: string | null };
export type PayrollRow = { id: string; profile_id: string; pay_month: string; gross_pay: number; deductions: number; net_pay: number; currency: string; reference: string; notes: string; status: string; revision: number };
export type TrainingRow = { id: string; profile_id: string; certification_name: string; issuing_body: string | null; date_obtained: string | null; expiry_date: string | null; certificate_number: string | null; notes: string | null; status: string; updated_at: string; first_name: string; last_name: string; org_unit_id: string | null; command_name: string | null };

export async function loadAdminHrContext(module: AdminHrModule) {
  const { data, error } = await supabase.rpc("admin_hr_context", { _module: module });
  if (error) throw error;
  return data as unknown as { staff: AdminHrStaff[] };
}

export async function loadPayroll() {
  const rows: PayrollRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("staff_payroll_records").select("id,profile_id,pay_month,gross_pay,deductions,net_pay,currency,reference,notes,status,revision").order("pay_month", { ascending: false }).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

export function payrollAmounts(gross: number, deductions: number) {
  if (!Number.isFinite(gross) || !Number.isFinite(deductions) || gross < 0 || deductions < 0 || deductions > gross) throw new Error("Deductions must be between zero and gross pay.");
  return Math.round((gross - deductions) * 100) / 100;
}

export function payrollTotals(rows: PayrollRow[]) {
  const totals = new Map<string, { gross: number; deductions: number; net: number }>();
  for (const row of rows.filter((r) => r.status !== "void")) {
    const current = totals.get(row.currency) ?? { gross: 0, deductions: 0, net: 0 };
    current.gross += Number(row.gross_pay); current.deductions += Number(row.deductions); current.net += Number(row.net_pay);
    totals.set(row.currency, current);
  }
  return Array.from(totals, ([currency, values]) => ({ currency, ...values }));
}

export function validateTrainingDates(obtained: string, expiry: string) {
  if (!obtained || (expiry && expiry < obtained)) throw new Error("Completion date is required; expiry cannot be before completion.");
}