import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CommandHeadPortal from "@/pages/CommandHeadPortal";
import { commandPortalScope, transferInPortalScope } from "@/lib/command-head-portal";
import { canAccessPath } from "@/lib/rbac";
import { showInNav } from "@/lib/nav-visibility";
import type { CommandWorkforce } from "@/lib/command-workforce";

const { rpc, from, state } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), state: { role: "oic", requestStatus: "pending", failWorkforce: false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "head" }, role: state.role, isOic: true, is2ic: false, isAdmin: false }) }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ can: () => true, loading: false }) }));
vi.mock("@/components/audit/ApprovalAuditTrail", () => ({ ApprovalAuditTrail: () => null }));

const workforce: CommandWorkforce = {
  assigned: true, command: { id: "home", name: "Own command" },
  staff: [{ id: "officer", name: "OWN OFFICER", unit: "Home" }],
  shifts: [{ id: "shift", name: "OWN OFFICER", shift: "Day", start_time: "08:00", end_time: "16:00" }],
  leave: [{ id: "own-leave", name: "OWN OFFICER", status: "pending", start_date: "2026-11-25", end_date: "2026-11-26" }],
  appraisals: [], shift_staff: 1, leave_staff: 0, appraisal_access: true,
};
const units = [{ id: "home", parent_id: null, name: "Home" }, { id: "empty-unit", parent_id: "home", name: "Empty unit" }, { id: "other", parent_id: null, name: "Other" }];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><CommandHeadPortal /></QueryClientProvider></MemoryRouter>);
  return client;
}
beforeEach(() => {
  cleanup(); rpc.mockReset(); from.mockReset(); state.requestStatus = "pending"; state.failWorkforce = false;
  from.mockImplementation((table: string) => ({ select: () => table === "org_units" ? { order: () => ({ range: async () => ({ data: units, error: null }) }) } : Promise.resolve({ data: [], error: null }) }));
  rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === "command_workforce_dashboard") return state.failWorkforce ? { data: null, error: { code: "42501", message: "Not authorized" } } : { data: workforce, error: null };
    if (name === "leave_request_queue") return { data: [
      { id: "own-leave", profile_id: "officer", type: "annual", status: state.requestStatus, start_date: "2026-11-25", end_date: "2026-11-26", can_review: true, profiles: { first_name: "OWN", last_name: "OFFICER" } },
      { id: "other-leave", profile_id: "outsider", type: "annual", status: "pending", start_date: "2026-11-25", end_date: "2026-11-26", can_review: true, profiles: { first_name: "OTHER", last_name: "COMMAND" } },
    ], error: null };
    if (name === "decide_leave_request") { state.requestStatus = String(args?._action); return { data: args?._id, error: null }; }
    if (name === "procurement_budget_status") return { data: [
      { org_unit_id: "home", org_unit_name: "OWN BUDGET", budget_amount: 1200, currency: "GHS", committed: 100, pending: 50, remaining: 1050, utilisation_pct: 12.5 },
      { org_unit_id: "other", org_unit_name: "OTHER BUDGET", budget_amount: 9000, currency: "GHS" },
    ], error: null };
    return { data: [], error: null };
  });
});

describe("command portal scope", () => {
  it("includes empty child units but never another command", () => {
    expect(commandPortalScope(workforce, units)).toEqual({ profileIds: ["officer"], unitIds: ["empty-unit", "home"] });
  });
  it("does not fall back to global records without a posting", () => {
    expect(commandPortalScope({ ...workforce, assigned: false }, units)).toEqual({ profileIds: [], unitIds: [] });
  });
  it("includes incoming transfers without needing the officer to be posted already", () => {
    const scope = commandPortalScope(workforce, units);
    expect(transferInPortalScope({ profile_id: "incoming", from_org_unit_id: "other", to_org_unit_id: "home" }, scope)).toBe(true);
    expect(transferInPortalScope({ profile_id: "other", from_org_unit_id: "other", to_org_unit_id: "elsewhere" }, scope)).toBe(false);
  });
  it("keeps the existing command-head gate in My Work", () => {
    for (const role of ["oic", "2ic", "admin"] as const) expect(showInNav("/my/command", "self", role, path => canAccessPath(path, { role }))).toBe(true);
    expect(canAccessPath("/my/command", { role: "staff" })).toBe(false);
  });
});

describe("command portal records and decisions", () => {
  it("derives command selection on the server and narrows leave before review", async () => {
    mount(); await screen.findByText("Own command");
    await screen.findByText("OFFICER, OWN");
    expect(screen.queryByText("COMMAND, OTHER")).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("command_workforce_dashboard", { _day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), _year: expect.any(Number) });
    expect(Object.keys(rpc.mock.calls.find(([name]) => name === "command_workforce_dashboard")?.[1] ?? {}).sort()).toEqual(["_day", "_year"]);
  });
  it("approves an own-command leave request with mandatory comments and reads the new status back", async () => {
    mount(); await screen.findByText("OFFICER, OWN");
    fireEvent.click(screen.getByTitle("Review request"));
    const approve = screen.getByRole("button", { name: "Approve", exact: true });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision comments (required)"), { target: { value: "Duty cover confirmed" } });
    fireEvent.click(approve);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("decide_leave_request", { _id: "own-leave", _action: "approved", _comments: "Duty cover confirmed" }));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === "leave_request_queue").length).toBeGreaterThan(1));
    expect(state.requestStatus).toBe("approved");
    fireEvent.click(screen.getByRole("button", { name: /Approved/ }));
    await screen.findByText("OFFICER, OWN");
    expect(screen.queryByText("COMMAND, OTHER")).not.toBeInTheDocument();
  });
  it("shows only assigned-branch budgets even to a broadly authorized reader", async () => {
    mount(); await screen.findByText("Own command");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Budgets", exact: true }), { button: 0, ctrlKey: false });
    await screen.findAllByText("OWN BUDGET");
    expect(screen.queryByText("OTHER BUDGET")).not.toBeInTheDocument();
    expect(screen.getAllByText("GHS 1,050.00")).toHaveLength(2);
  });
  it("does not fetch approval or budget records when command reads are denied", async () => {
    state.failWorkforce = true; mount();
    await screen.findByRole("alert");
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("leave_request_queue");
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("procurement_budget_status");
  });
});