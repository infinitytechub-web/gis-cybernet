import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHoldingRecordLink } from "@/hooks/useHoldingRecordLink";

const db = vi.hoisted(() => ({ from: vi.fn(), single: vi.fn(), eq: vi.fn(), is: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function View({ allowed }: { allowed: boolean }) {
  const link = useHoldingRecordLink(allowed);
  const location = useLocation();
  return <><p>{link.data?.first_name}</p><p role="alert">{link.error?.message}</p><output>{location.search}</output><button onClick={link.close}>Close record</button></>;
}
function setup(allowed = true) {
  const chain = { select: vi.fn().mockReturnThis(), eq: db.eq.mockReturnThis(), is: db.is.mockReturnThis(), maybeSingle: db.single };
  db.from.mockReturnValue(chain);
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/command-operations?tab=holding&record=case-19&edit=1"]}><View allowed={allowed} /></MemoryRouter></QueryClientProvider>);
}
describe("Holding Center record links", () => {
  it("loads the exact selected record independently of the active list and clears context on close", async () => {
    db.single.mockResolvedValue({ data: { id: "case-19", first_name: "SELECTED CASE" }, error: null });
    setup();
    expect(await screen.findByText("SELECTED CASE")).toBeTruthy();
    expect(db.eq).toHaveBeenCalledWith("id", "case-19");
    expect(db.is).toHaveBeenCalledWith("deleted_at", null);
    fireEvent.click(screen.getByText("Close record"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("?tab=holding"));
  });
  it("does not fetch a record for unauthorized users", () => {
    setup(false);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("shows an unavailable record instead of silently opening the list", async () => {
    db.single.mockResolvedValue({ data: null, error: null });
    setup();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unavailable or you do not have access"));
  });
});