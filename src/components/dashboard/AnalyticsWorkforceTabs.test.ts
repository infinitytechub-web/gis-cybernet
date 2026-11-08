import { describe, it, expect } from "vitest";
import { countAppraisalStates } from "./AnalyticsWorkforceTabs";
describe("analytics appraisal counts", () => {
  it("counts each stage and treats missing state as draft", () => {
    expect(countAppraisalStates([{ workflow_state: "approved" }, { workflow_state: "approved" }, { workflow_state: null }])).toEqual({ approved: 2, draft: 1 });
  });
});
