import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaffApplicationForm } from "@/components/hr/StaffApplicationForm";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: state.rpc } }));
vi.mock("@/lib/read-record-pages", () => ({ readRecordPages: vi.fn(async () => [{ id: "staff-1", first_name: "AMA", last_name: "MENSAH", staff_id: "GIS-001", name: "HQ" }]) }));
vi.mock("@/components/ui/staff-combobox", () => ({ StaffCombobox: ({ onValueChange }: { onValueChange: (value: string) => void }) => <select aria-label="Staff member" onChange={(e) => onValueChange(e.target.value)}><option value="">Select</option><option value="staff-1">AMA MENSAH</option></select> }));
vi.mock("@/components/ui/searchable-select", () => ({ SearchableSelect: () => <div /> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  const submitted = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StaffApplicationForm open onOpenChange={vi.fn()} onSubmitted={submitted} /></QueryClientProvider>);
  return submitted;
}
async function fill() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit application" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: "staff-1" } });
  fireEvent.change(screen.getByLabelText("Position *"), { target: { value: " Staff Officer " } });
  fireEvent.change(screen.getByLabelText("Application statement *"), { target: { value: " I wish to apply for the staff officer position. " } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit application" })); });
}
describe("staff application submission", () => {
  it("submits the selected profile and returns the actual saved application ID for review", async () => {
    state.rpc.mockResolvedValue({ data: "application-123", error: null });
    const submitted = setup(); await fill();
    await waitFor(() => expect(submitted).toHaveBeenCalledWith("application-123"));
    expect(state.rpc).toHaveBeenCalledWith("record_staff_application", { _profile_id: "staff-1", _type: "position", _position_title: "Staff Officer", _target_org_unit_id: null, _statement: "I wish to apply for the staff officer position." });
  });
  it("does not open a saved record when server permission is denied", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "Not authorised to submit for this officer" } });
    const submitted = setup(); await fill();
    expect(await screen.findByText("Not authorised to submit for this officer")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit application" })).not.toBeDisabled();
  });
});