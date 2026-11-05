import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DutyAvailabilitySummary } from "@/components/hr/DutyAvailabilitySummary";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ canPath: () => false }) }));
const data = { day: "2026-11-05", shifts: { assigned_staff: 50, assignments: 50 }, on_leave: 1, excused_today: 0, excuse_requests: {} };
function mount(props: { command?: string; since?: string; personal?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><DutyAvailabilitySummary {...props} /></MemoryRouter></QueryClientProvider>);
}
describe("real duty summary scope", () => {
  beforeEach(() => { cleanup(); rpc.mockReset(); });
  it("requests server-enforced own-record scope for personal summaries", async () => {
    rpc.mockResolvedValue({ data, error: null });
    mount({ personal: true });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("hr_duty_dashboard_summary", { _org_unit_id: undefined, _since: undefined, _self: true }));
    await screen.findByText("50");
  });
  it("passes command and reporting period without filtering current duty in the client", async () => {
    rpc.mockResolvedValue({ data, error: null });
    mount({ command: "command-id", since: "2026-10-06T00:00:00Z" });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("hr_duty_dashboard_summary", { _org_unit_id: "command-id", _since: "2026-10-06T00:00:00Z", _self: false }));
    expect(await screen.findByText("50")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
  });
  it("does not disguise a denied read as zero staff on leave", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Permission denied" } });
    mount();
    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(4));
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});