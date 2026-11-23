import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PayrollAdmin from "@/pages/PayrollAdmin";
import TrainingRecordsAdmin from "@/pages/TrainingRecordsAdmin";

const { rpc, from, loadPayroll, loadAdminHrContext } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), loadPayroll: vi.fn(), loadAdminHrContext: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-test" } }) }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ can: () => true }) }));
vi.mock("@/lib/admin-hr", async importOriginal => ({ ...(await importOriginal<object>()), loadPayroll, loadAdminHrContext }));
vi.mock("@/components/ui/staff-combobox", () => ({ StaffCombobox: ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => <select aria-label="Officer" value={value} onChange={e => onValueChange(e.target.value)}><option value="">Select</option><option value="profile-test">Officer</option></select> }));

function setup(screenToRender: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}>{screenToRender}</QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  rpc.mockReset(); loadPayroll.mockReset(); loadAdminHrContext.mockReset();
  loadAdminHrContext.mockResolvedValue({ staff: [{ id: "profile-test", first_name: "TEST", last_name: "OFFICER", org_unit_id: "command-test", command_name: "TEST command" }] });
  loadPayroll.mockResolvedValue([]);
  rpc.mockImplementation(async name => ({ data: name === "admin_hr_training_rows" ? [] : "record-test", error: null }));
});

describe("administration saves", () => {
  it("submits exact payroll amounts and reloads the authorized register", async () => {
    setup(<PayrollAdmin />);
    const add = await screen.findByRole("button", { name: "Add payroll record" });
    await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Officer"), { target: { value: "profile-test" } });
    fireEvent.change(screen.getByLabelText("Gross pay"), { target: { value: "1250" } });
    fireEvent.change(screen.getByLabelText("Deductions"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "TEST-REF" } });
    fireEvent.change(screen.getByLabelText("Reason for this change"), { target: { value: "Approved figures" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payroll" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_hr_payroll_save", expect.objectContaining({ _profile: "profile-test", _gross: 1250, _deductions: 250, _currency: "GHS", _reference: "TEST-REF", _reason: "Approved figures", _revision: null })));
    await waitFor(() => expect(loadPayroll.mock.calls.length).toBeGreaterThan(1));
  });
  it("does not submit payroll deductions above gross pay", async () => {
    setup(<PayrollAdmin />);
    const add = await screen.findByRole("button", { name: "Add payroll record" }); await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Officer"), { target: { value: "profile-test" } });
    fireEvent.change(screen.getByLabelText("Gross pay"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Deductions"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payroll" }));
    expect(rpc.mock.calls.filter(([name]) => name === "admin_hr_payroll_save")).toHaveLength(0);
  });
  it("submits day-first training entry as ISO to the existing certification register", async () => {
    setup(<TrainingRecordsAdmin />);
    const add = await screen.findByRole("button", { name: "Add training record" }); await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Officer"), { target: { value: "profile-test" } });
    fireEvent.change(screen.getByLabelText("Training / certification"), { target: { value: "TEST training" } });
    fireEvent.change(screen.getByLabelText("Completed"), { target: { value: "23/11/2026" } });
    fireEvent.blur(screen.getByLabelText("Completed"));
    fireEvent.change(screen.getByLabelText("Reason for this change"), { target: { value: "Recorded completion" } });
    fireEvent.click(screen.getByRole("button", { name: "Save training" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_hr_training_save", expect.objectContaining({ _profile: "profile-test", _name: "TEST training", _obtained: "2026-11-23", _expiry: null, _reason: "Recorded completion" })));
  });
});