import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffImportAIReview from "@/components/staff/StaffImportAIReview";
const { review } = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/lib/staff-import-ai", () => ({ reviewStaffImport: review }));
const row = { row_no: 1, first_name: "AMA", last_name: "MENSAH", staff_id_raw: "GIS-1", intake: "19", rank: "Inspector", unit: "Station", region: "Accra", shift: "A", phone: "", gender: "Female", email_raw: "", email_preview: "", outcome: "ready" as const };
describe("AI comparison controls", () => {
  beforeEach(() => { cleanup(); review.mockReset(); });
  it("requires selection and preserves rows after denied access", async () => {
    review.mockRejectedValue(new Error("Only authorized HR import administrators may run this review."));
    const rows = [row]; const before = JSON.stringify(rows);
    render(<StaffImportAIReview rows={rows} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "AI comparison" }));
    expect(screen.getByRole("button", { name: "Compare selected" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Select import row 1" }));
    await user.click(screen.getByRole("button", { name: "Compare selected" }));
    await screen.findByRole("alert");
    expect(JSON.stringify(rows)).toBe(before);
    expect(review).toHaveBeenCalledTimes(1);
  });
  it("displays returned candidate evidence without changing import outcomes", async () => {
    review.mockResolvedValue([{ row_no: 1, assessment: "mismatch", confidence: "high", reason: "Staff ID matches but intake differs.", imported: row, existing: { ...row, id: "staff-1", staff_id: "GIS-1", intake: "20" }, candidates_truncated: false }]);
    render(<StaffImportAIReview rows={[row]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "AI comparison" }));
    await user.click(screen.getByRole("button", { name: "Select this page" }));
    await user.click(screen.getByRole("button", { name: "Compare selected" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "AI comparison findings" })).toBeVisible());
    expect(row.outcome).toBe("ready");
    expect(review.mock.calls[0][0][0]).not.toHaveProperty("phone");
  });
});