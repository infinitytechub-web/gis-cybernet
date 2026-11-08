import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CommandWorkforceDashboard from "@/pages/CommandWorkforceDashboard";
import { filterWorkforceRows, parseCommandWorkforce } from "@/lib/command-workforce";
import { canAccessPath } from "@/lib/rbac";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "head" } }) }));
vi.mock("@/hooks/useRbac", () => ({ useRbac: () => ({ canPath: () => true }) }));
const staff = Array.from({length: 28}, (_, i) => ({ id: String(i), name: `OFFICER ${String(i).padStart(2,"0")}`, rank: "Inspector", unit: "Own unit", status: "active" }));
const data = { assigned: true, command: { id: "own", name: "Own command" }, staff, shifts: [], leave: [], appraisals: [], shift_staff: 3, leave_staff: 1, appraisal_access: true };
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CommandWorkforceDashboard/></MemoryRouter></QueryClientProvider>); }
describe("command workforce access and records", () => {
  beforeEach(() => { cleanup(); rpc.mockReset(); });
  it("requests only the date and year, never a caller-selected command", async () => {
    rpc.mockResolvedValue({ data, error: null }); mount();
    await screen.findByText("Own command");
    expect(rpc).toHaveBeenCalledWith("command_workforce_dashboard", { _day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), _year: expect.any(Number) });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(["_day", "_year"]);
  });
  it("keeps 25 records per page and reads back the next page", async () => {
    rpc.mockResolvedValue({ data, error: null }); mount(); await screen.findByText("Own command");
    expect(screen.getAllByText("OFFICER 24")).toHaveLength(2);
    expect(screen.queryByText("OFFICER 25")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Next page"}));
    expect(screen.getAllByText("OFFICER 25")).toHaveLength(2);
    expect(screen.queryByText("OFFICER 24")).not.toBeInTheDocument();
  });
  it("searches real returned rows without reducing headline totals", async () => {
    rpc.mockResolvedValue({ data, error: null }); mount(); await screen.findByText("Own command");
    fireEvent.change(screen.getByLabelText("Search staff"), { target: { value: "OFFICER 27" } });
    expect(screen.getAllByText("OFFICER 27")).toHaveLength(2);
    expect(screen.queryByText("OFFICER 00")).not.toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
  });
  it("never turns a denied response into zero personnel", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Not authorized" } }); mount();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Command personnel")).not.toBeInTheDocument();
  });
  it("does not show another command when the caller has no posting", async () => {
    rpc.mockResolvedValue({ data: { assigned: false }, error: null }); mount();
    expect(await screen.findByText("No command is assigned to your staff record.")).toBeInTheDocument();
    expect(screen.queryByText("Command personnel")).not.toBeInTheDocument();
  });
  it("requires a specific HR grant for staff officers", () => {
    expect(canAccessPath("/hr/command", {role:"staff_officer"})).toBe(false);
    expect(canAccessPath("/hr/command", {role:"staff_officer",capabilities:["*"]})).toBe(false);
    expect(canAccessPath("/hr/command", {role:"staff_officer",capabilities:["hr"]})).toBe(true);
  });
  it("denies ordinary staff and allows command heads", () => {
    expect(canAccessPath("/hr/command", {role:"staff"})).toBe(false);
    expect(canAccessPath("/hr/command", {role:"oic"})).toBe(true);
    expect(canAccessPath("/hr/command", {role:"2ic"})).toBe(true);
  });
  it("rejects incomplete counts rather than fabricating a dashboard", () => {
    expect(() => parseCommandWorkforce({...data, shift_staff: undefined})).toThrow();
    expect(() => parseCommandWorkforce({...data, staff: null})).toThrow();
  });
  it("filters status and normalized search together", () => {
    expect(filterWorkforceRows([{id:"1",name:"ALICE",status:"approved"},{id:"2",name:"ALICE",status:"pending"}], " alice ", "approved").map(r=>r.id)).toEqual(["1"]);
  });
});