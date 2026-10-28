import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { attendanceTrend, pendingRepatriations } from "@/lib/command-operations-dashboard";
import { CommandOperationsDashboard } from "@/components/command/CommandOperationsDashboard";

const state = vi.hoisted(() => ({ grants: [] as string[], readOnly: false, rpc: vi.fn(), from: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "officer-1" } }) }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ can: (key: string) => state.grants.includes(key), holdingReadOnly: state.readOnly }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: state.from, rpc: state.rpc, removeChannel: vi.fn(),
  channel: () => { const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }; return channel; },
} }));
vi.mock("@/components/ui/chart", () => ({ ChartContainer: () => <div />, ChartTooltip: () => null, ChartTooltipContent: () => null }));
afterEach(() => { cleanup(); state.grants = []; state.readOnly = false; vi.clearAllMocks(); });
function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><CommandOperationsDashboard /></MemoryRouter></QueryClientProvider>);
}

describe("command operations dashboard", () => {
  it("combines authorized command attendance on the same date without inventing absence", () => {
    expect(attendanceTrend([
      { period_start: "2026-10-28", present: 19, late: 4, absent: 0, excused: 1 },
      { period_start: "2026-10-28", present: 2, late: 1, absent: 3, excused: 0 },
    ], "2026-10-27", "2026-10-28")).toEqual([
      { date: "2026-10-27", present: 0, late: 0, absent: 0, excused: 0 },
      { date: "2026-10-28", present: 21, late: 5, absent: 3, excused: 1 },
    ]);
  });
  it("counts unfinished repatriation workflows once, excluding signed decisions and negative recommendations", () => {
    expect(pendingRepatriations(["pending", "pending", "complete", "declined"], [
      { record_id: "pending", tier: 1, decision: "recommend" },
      { record_id: "complete", tier: 3, decision: "approve" },
      { record_id: "declined", tier: 2, decision: "not_recommend" },
    ])).toBe(1);
  });
  it("does not query detention or attendance without their individual grants", () => {
    renderDashboard();
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("reads the existing attendance report and does not query detainees for attendance-only access", async () => {
    state.grants = ["attendance-overview"];
    state.rpc.mockResolvedValue({ data: [], error: null });
    renderDashboard();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("attendance_validation", expect.objectContaining({ _period: "day" })));
    expect(state.from).not.toHaveBeenCalled();
    expect(await screen.findByText("No attendance recorded in this period.")).toBeInTheDocument();
  });
  it("shows unavailable rather than zero when attendance cannot load", async () => {
    state.grants = ["attendance-overview"];
    state.rpc.mockResolvedValue({ data: null, error: { message: "Denied" } });
    renderDashboard();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No attendance recorded in this period.")).not.toBeInTheDocument();
  });
  it("read-only holding access cannot read approval workflows", async () => {
    state.grants = ["detention"];
    state.readOnly = true;
    const result = { data: null, error: null, count: 12 };
    const query = { select: () => query, is: () => query, eq: () => query, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    state.from.mockReturnValue(query);
    renderDashboard();
    await waitFor(() => expect(state.from).toHaveBeenCalledTimes(2));
    expect(state.from.mock.calls.every(([table]) => table === "detention_records")).toBe(true);
    expect(screen.queryByText("Pending approvals")).not.toBeInTheDocument();
  });
});