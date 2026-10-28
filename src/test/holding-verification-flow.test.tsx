import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HoldingStaffVerification from "@/pages/HoldingStaffVerification";

const mocks = vi.hoisted(() => ({
  role: "staff", userId: "staff-user", rows: [] as Record<string, unknown>[],
  read: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), signed: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId }, role: mocks.role }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/image-upload", () => ({ uploadPhoto: mocks.upload }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ order: mocks.read }) }), rpc: mocks.rpc,
  storage: { from: () => ({ remove: mocks.remove, createSignedUrl: mocks.signed }) },
} }));

const request = { id: "request-id", user_id: "staff-user", submitted_staff_id: "GIS-100", status: "pending", photo_path: "staff-user/photo.png", created_at: "2026-10-28T12:00:00Z", reviewed_at: null, review_reason: null };
function mount() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><HoldingStaffVerification /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); mocks.role = "staff"; mocks.userId = "staff-user"; mocks.rows = [];
  mocks.read.mockImplementation(async () => ({ data: mocks.rows, error: null }));
  mocks.rpc.mockResolvedValue({ data: "request-id", error: null });
  mocks.upload.mockResolvedValue("staff-user/photo.png");
  mocks.remove.mockResolvedValue({ error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/private-photo" }, error: null });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() }));
});

describe("Holding verification form integration", () => {
  it("submits staff ID and private photo and reads back pending status", async () => {
    mocks.rpc.mockImplementation(async () => { mocks.rows = [request]; return { data: request.id, error: null }; });
    mount();
    const submit = await screen.findByRole("button", { name: "Submit for verification" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Registered Staff ID"), { target: { value: "GIS-100" } });
    fireEvent.change(screen.getByLabelText("Staff photo"), { target: { files: [new File(["photo"], "staff.png", { type: "image/png" })] } });
    const form = submit.closest("form");
    if (!form) throw new Error("Submission form missing");
    fireEvent.submit(form);
    await screen.findByText("Pending administrator review");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ bucket: "holding-staff-verification", upsert: false }));
    expect(mocks.rpc).toHaveBeenCalledWith("submit_holding_staff_verification", { _staff_id: "GIS-100", _photo_path: "staff-user/photo.png" });
  });
  it("removes an unreferenced photo when server identity validation fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Staff ID does not match" } }); mount();
    const submit = await screen.findByRole("button", { name: "Submit for verification" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Registered Staff ID"), { target: { value: "WRONG" } });
    fireEvent.change(screen.getByLabelText("Staff photo"), { target: { files: [new File(["photo"], "staff.png", { type: "image/png" })] } });
    const form = submit.closest("form");
    if (!form) throw new Error("Submission form missing");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(["staff-user/photo.png"]));
    expect(screen.queryByText("Pending administrator review")).not.toBeInTheDocument();
  });
  it("requires both the photo to render and a reason before Super Admin approval", async () => {
    mocks.role = "admin"; mocks.userId = "admin-user"; mocks.rows = [request]; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const approve = await screen.findByRole("button", { name: "Approve Command read access" });
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Identity checked" } });
    expect(approve).toBeDisabled();
    fireEvent.load(await screen.findByAltText("Submitted staff verification photo"));
    await waitFor(() => expect(approve).not.toBeDisabled()); fireEvent.click(approve);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("review_holding_staff_verification", { _id: "request-id", _decision: "approved", _reason: "Identity checked" }));
  });
  it("blocks approval if the private photo fails to load", async () => {
    mocks.role = "admin"; mocks.userId = "admin-user"; mocks.rows = [request];
    mocks.signed.mockResolvedValue({ data: null, error: { message: "Denied" } }); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await screen.findByText("Could not load the submitted photo. Approval is blocked.");
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Check" } });
    expect(screen.getByRole("button", { name: "Approve Command read access" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not offer staff a review action for their own pending submission", async () => {
    mocks.rows = [request]; mount(); await screen.findByText("Pending administrator review");
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });
});