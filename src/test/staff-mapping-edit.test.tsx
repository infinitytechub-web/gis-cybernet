import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaffMappingEditDialog } from "@/components/staff-mapping/StaffMappingEditDialog";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/components/org/CommandPicker", () => ({ CommandPicker: ({ onChange }: { onChange: (id: string) => void }) => <select aria-label="Command / unit" onChange={(e) => onChange(e.target.value)}><option value="old">Old command</option><option value="new">New unit</option></select> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(fail = false) {
  state.rpc.mockImplementation(async (name: string) => name === "staff_mapping_edit_context" ? { data: { org_unit_id: "old", destinations: [] }, error: null } : fail ? { data: null, error: { message: "Assignment changed; reload" } } : { data: "new", error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const close = vi.fn();
  render(<QueryClientProvider client={client}><StaffMappingEditDialog record={{ profile_id: "staff-1", full_name: "AMA MENSAH", org_unit_name: "Old command" }} onClose={close} /></QueryClientProvider>);
  return { close, invalidate };
}
async function save() {
  await screen.findByLabelText("Command / unit");
  fireEvent.change(screen.getByLabelText("Command / unit"), { target: { value: "new" } });
  fireEvent.change(screen.getByLabelText("Assignment reason *"), { target: { value: "Approved posting" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save assignment" })); });
}
describe("Staff Mapping edit", () => {
  it("saves one staff posting with stale-assignment protection and refreshes real dashboard keys", async () => {
    const { close, invalidate } = setup(); await save();
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(state.rpc).toHaveBeenCalledWith("save_staff_mapping", { _profile_id: "staff-1", _expected_org_unit_id: "old", _to_org_unit_id: "new", _reason: "Approved posting" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["staff-mapping-rows"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-overview-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["hr-hub-staff-stats"] });
  });
  it("does not announce a saved assignment or close after a rejected stale edit", async () => {
    const { close } = setup(true); await save();
    expect(await screen.findByText("Assignment changed; reload")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });
});