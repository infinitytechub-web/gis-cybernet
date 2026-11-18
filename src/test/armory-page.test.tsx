import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ArmoryWeapons from "@/pages/ArmoryWeapons";

const state = vi.hoisted(() => ({ manage: false, rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "viewer" } }) }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ can: () => true }) }));
vi.mock("@/hooks/useStaffIdDisplay", () => ({ useStaffIdDisplay: () => ({ formatStaffId: (s: string) => s }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc,
  from: () => { const query = { select: () => query, order: () => query, range: async () => ({ data: [], error: null }) }; return query; },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(manage: boolean) {
  state.rpc.mockResolvedValue({ data: { commands: [{ id: "c", name: "Authorized command", active: true, can_approve: false, can_manage: manage }], staff: [] }, error: null });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ArmoryWeapons /></MemoryRouter></QueryClientProvider>);
}
describe("armory command controls", () => {
  it("does not allow a read-only viewer to add register records", async () => {
    show(false);
    await screen.findByText("Command establishment");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Weapon Register" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("button", { name: "Add record" })).not.toBeInTheDocument();
  });
  it("allows a scoped manager to open a record form", async () => {
    show(true);
    await screen.findByText("Command establishment");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Weapon Register" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Add record" }));
    expect(await screen.findByLabelText("Serial number *")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeRequired();
  });
});