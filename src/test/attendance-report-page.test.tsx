import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AttendanceReport from "@/pages/AttendanceReport";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/hooks/useAttendanceReportSync", () => ({ useAttendanceReportSync: () => {} }));
vi.mock("@/hooks/useStaffIdDisplay", () => ({ useStaffIdDisplay: () => ({ formatStaffId: (id: string) => id }) }));
beforeEach(() => {
  rpc.mockReturnValue({ range: async () => ({ data: [{ id: "one", profile_id: "staff", owner_user_id: "user", staff_name: "OFFICER ONE", staff_id: "GIS-001", org_unit_id: "command", command_name: "Command A", date: "2026-11-01", check_in: "2026-11-01T08:00:00Z", check_out: "2026-11-01T16:00:00Z", status: "present" }], error: null }) });
});
it("reads officer clock history, searches it and switches to command/month totals", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AttendanceReport /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("OFFICER ONE")).toBeInTheDocument();
  expect(screen.getByText("GIS-001")).toBeInTheDocument();
  expect(screen.getAllByText("8.00")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Officer"), { target: { value: "missing" } });
  expect(screen.getByText("No attendance records match these filters.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Officer"), { target: { value: "OFFICER" } });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Command & month totals" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("tab", { name: "Command & month totals" }));
  expect(await screen.findByText("November 2026")).toBeInTheDocument();
  expect(screen.getByText("Command A")).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("attendance_report_rows", expect.objectContaining({ _from: expect.any(String), _to: expect.any(String) }));
});