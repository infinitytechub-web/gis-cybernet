import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshLeaveDashboards, validateLeaveDecision } from "@/lib/leave-workflow";

describe("leave decisions", () => {
  it("requires comments on approval", () => {
    expect(() => validateLeaveDecision("approved", "  ")).toThrow("Decision comments are required");
    expect(() => validateLeaveDecision("approved", "Cover arranged")).not.toThrow();
  });
  it("requires comments on rejection", () => {
    expect(() => validateLeaveDecision("rejected", "")).toThrow();
  });
  it("refreshes the real leave and shifts dashboard queries after saving", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await refreshLeaveDashboards(client);
    for (const key of ["hr-duty-summary", "command-workforce", "my-leave-requests", "leave-requests", "admin-overview-summary"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});