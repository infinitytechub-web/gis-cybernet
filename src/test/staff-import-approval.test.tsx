import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StaffListImportActions from "@/components/staff/StaffListImportActions";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAudit: vi.fn() }));

function renderActions() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <StaffListImportActions record={{ id: "import-1", file_name: "staff.csv", status: "uploaded", approval_status: null, total_rows: 12, target_org_unit_id: "unit-1", review_notes: null }} />
  </QueryClientProvider>);
}

describe("staff import approval fails closed", () => {
  beforeEach(() => { cleanup(); rpc.mockReset(); });

  it.each(["PGRST202", "42883", "42501"])("blocks approval when preview returns %s", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Unavailable" } });
    renderActions();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Approve", exact: true }));
    await screen.findByRole("alert");
    const confirm = screen.getByRole("button", { name: "Confirm and continue" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["preview_staff_list_retirements"]);
  });

  it("blocks approval while the retirement list is still loading", async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    renderActions();
    await userEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
    expect(screen.getByRole("button", { name: "Confirm and continue" })).toBeDisabled();
  });

  it.each([null, "invalid"])("does not treat a malformed preview (%s) as zero retirements", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    renderActions();
    await userEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Confirm and continue" })).toBeDisabled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("requires recorded confirmation even when a successfully loaded list is empty", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { new: 0, matched: 12, retired: 0 }, error: null });
    renderActions();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Approve", exact: true }));
    const confirm = await screen.findByRole("button", { name: "Confirm and continue" });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["preview_staff_list_retirements", "confirm_staff_list_retirements", "staff_list_import_review"]);
    expect(rpc.mock.calls[1][1]).toEqual({ _import_id: "import-1", _count: 0, _profile_ids: [] });
  });
});