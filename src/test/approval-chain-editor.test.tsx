import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApprovalChainEditor } from "@/components/detention/ApprovalChainEditor";

const mocks = vi.hoisted(() => ({ isAdmin: true, read: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: mocks.isAdmin, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ order: () => ({ order: mocks.read }) }) }), rpc: mocks.rpc } }));
const tiers = ["bail", "repatriation"].flatMap((workflow) => [1, 2, 3].map((tier) => ({ id: `${workflow}-${tier}`, workflow, tier, label: `Step ${tier}`, role: "supervisor", configured_at: null })));
Object.assign(HTMLElement.prototype, { hasPointerCapture: () => false, setPointerCapture: () => {}, releasePointerCapture: () => {}, scrollIntoView: () => {} });
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApprovalChainEditor /></QueryClientProvider>);
}
describe("approval authority editor", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.isAdmin = true; mocks.read.mockResolvedValue({ data: tiers, error: null }); mocks.rpc.mockResolvedValue({ error: null }); });
  it("does not read or save settings for non-Super Admins", async () => {
    mocks.isAdmin = false;
    mount();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves a changed signing role for all six tiers in one request", async () => {
    mount();
    const picker = await screen.findByRole("combobox", { name: "bail tier 1 signing role" });
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: /^OIC$/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save signing authority" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("save_approval_chain", { _tiers: tiers.map(({ id, label, role }) => ({ id, label, role: id === "bail-1" ? "oic" : role })) });
  });
  it("blocks saving after an incomplete load", async () => {
    mocks.read.mockResolvedValue({ data: tiers.slice(0, 5), error: null });
    mount();
    await screen.findByRole("combobox", { name: "bail tier 1 signing role" });
    expect(screen.getByRole("button", { name: "Save signing authority" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks saving when labels are blank", async () => {
    mount();
    await screen.findByRole("combobox", { name: "bail tier 1 signing role" });
    await userEvent.clear(screen.getAllByRole("textbox")[0]);
    expect(screen.getByRole("button", { name: "Save signing authority" })).toBeDisabled();
  });
});