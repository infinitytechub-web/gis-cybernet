import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppraisalQueue } from "./AppraisalQueue";
import { APPRAISAL_CRITERIA } from "@/lib/appraisal-workflow";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const row = { id: "review-1", staff_profile_id: "officer-1", first_name: "TEST", last_name: "OFFICER", staff_id: "TEST-1", command_name: "Command", org_unit_id: "command-1", period_year: 2026, period_month: 11, total_score: 21, workflow_state: "submitted", actions: ["review", "return"], created_at: "2026-11-05T00:00:00Z" };
let state: string;
let failure: boolean;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><AppraisalQueue /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  state = "submitted"; failure = false; rpc.mockReset();
  rpc.mockImplementation(async (name, args) => {
    if (name === "appraisal_queue_rows") return { data: [{ ...row, workflow_state: state }], error: null };
    if (name === "appraisal_workflow_context") return { data: { actions: ["review", "return"], record: { ...row, workflow_state: state }, scores: APPRAISAL_CRITERIA.map(criterion => ({ criterion, score: 3 })), history: [] }, error: null };
    if (name === "appraisal_transition") {
      if (failure) return { data: null, error: { message: "Appraisal changed; reload before deciding" } };
      state = args._action === "review" ? "under_review" : "returned";
      return { data: state, error: null };
    }
    throw new Error(`Unexpected request ${name}`);
  });
});
describe("appraisal queue decisions", () => {
  it("confirms a review and reads the updated status back into the queue", async () => {
    setup(); fireEvent.click(await screen.findByRole("button", { name: "Review / continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start review" }));
    expect(rpc.mock.calls.filter(([name]) => name === "appraisal_transition")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("appraisal_transition", { _appraisal: "review-1", _action: "review", _expected_state: "submitted", _note: "" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Under review", { selector: "td > div" })).toBeInTheDocument();
  });
  it("requires a reason before returning an appraisal", async () => {
    setup(); fireEvent.click(await screen.findByRole("button", { name: "Review / continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Return for corrections" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "Recheck attendance score" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("appraisal_transition", expect.objectContaining({ _action: "return", _note: "Recheck attendance score" })));
  });
  it("keeps the record open when a stale decision is rejected", async () => {
    failure = true; setup(); fireEvent.click(await screen.findByRole("button", { name: "Review / continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start review" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Appraisal changed; reload before deciding")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});