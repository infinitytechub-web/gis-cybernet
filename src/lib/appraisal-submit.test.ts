import { describe, it, expect, vi } from "vitest";
import {
  checkExistingAppraisals,
  submitBulkAppraisals,
} from "./appraisal-submit";

const CRITERIA = [{ key: "job_knowledge" }, { key: "quality_of_work" }];

/**
 * Build a chainable mock that mimics the small subset of the Supabase
 * query builder used by the helpers. Each call returns `this` so that
 * `.from().select().in().eq().is()` works, then resolves via `.then`
 * (here we instead expose `_run` by overriding the terminal method).
 */
function makeSelectChain(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (onF: any) => Promise.resolve(result).then(onF),
  };
  return chain;
}

function makeInsertChain(result: { data: any; error: any }) {
  return {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => result),
      })),
    })),
  };
}

describe("checkExistingAppraisals", () => {
  it("returns empty array when no targets given", async () => {
    const client = { from: vi.fn() };
    const out = await checkExistingAppraisals(client, {
      targetIds: [],
      periodYear: 2026,
      periodMonth: 5,
    });
    expect(out).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("dedupes existing officer ids returned by the DB", async () => {
    const chain = makeSelectChain({
      data: [
        { staff_profile_id: "a" },
        { staff_profile_id: "a" },
        { staff_profile_id: "b" },
      ],
      error: null,
    });
    const client = { from: vi.fn(() => chain) };
    const out = await checkExistingAppraisals(client, {
      targetIds: ["a", "b", "c"],
      periodYear: 2026,
      periodMonth: 5,
    });
    expect(out.sort()).toEqual(["a", "b"]);
    expect(chain.eq).toHaveBeenCalledWith("period_year", 2026);
    expect(chain.eq).toHaveBeenCalledWith("period_month", 5);
    expect(chain.is).not.toHaveBeenCalled();
  });

  it("uses .is(null) for annual (null) period", async () => {
    const chain = makeSelectChain({ data: [], error: null });
    const client = { from: vi.fn(() => chain) };
    await checkExistingAppraisals(client, {
      targetIds: ["a"],
      periodYear: 2026,
      periodMonth: null,
    });
    expect(chain.is).toHaveBeenCalledWith("period_month", null);
  });
});

describe("submitBulkAppraisals — partial success reporting", () => {
  const payloadBase = {
    appraised_by: "reviewer",
    period_year: 2026,
    period_month: 5,
    status: "submitted" as const,
    comments: null,
    submitted_at: "2026-05-07T00:00:00Z",
  };
  const scores = { job_knowledge: 4, quality_of_work: 5 };

  it("reports created, duplicates and failures separately", async () => {
    // Simulate three officers: success, duplicate (23505), generic failure.
    const responses: Array<{ data: any; error: any }> = [
      { data: { id: "ap-1" }, error: null },
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: null, error: { code: "XX000", message: "boom" } },
    ];
    let callIdx = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "staff_appraisals") {
          return makeInsertChain(responses[callIdx++]);
        }
        // staff_appraisal_scores insert — always succeeds in this test
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    const out = await submitBulkAppraisals(client, {
      targetIds: ["ok", "dup", "fail"],
      payloadBase,
      scores,
      criteria: CRITERIA,
    });

    expect(out.created).toEqual(["ok"]);
    expect(out.duplicates).toEqual(["dup"]);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toContain("fail:");
    expect(out.failures[0]).toContain("boom");
  });

  it("classifies trigger-raised 'already exists' as duplicate even without 23505", async () => {
    const client = {
      from: vi.fn(() =>
        makeInsertChain({
          data: null,
          error: {
            code: "P0001",
            message: "An appraisal already exists for this officer for the May 2026 period.",
          },
        }),
      ),
    };
    const out = await submitBulkAppraisals(client, {
      targetIds: ["dup"],
      payloadBase,
      scores,
      criteria: CRITERIA,
    });
    expect(out.duplicates).toEqual(["dup"]);
    expect(out.failures).toEqual([]);
  });

  it("counts a score-insert failure against the officer", async () => {
    let firstAppraisal = true;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "staff_appraisals") {
          return makeInsertChain({ data: { id: "ap-x" }, error: null });
        }
        if (firstAppraisal) {
          firstAppraisal = false;
          return { insert: vi.fn(async () => ({ error: { message: "score insert failed" } })) };
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };
    const out = await submitBulkAppraisals(client, {
      targetIds: ["ok"],
      payloadBase,
      scores,
      criteria: CRITERIA,
    });
    expect(out.created).toEqual([]);
    expect(out.failures[0]).toContain("score insert failed");
  });

  it("handles an empty target list as a no-op", async () => {
    const client = { from: vi.fn() };
    const out = await submitBulkAppraisals(client, {
      targetIds: [],
      payloadBase,
      scores,
      criteria: CRITERIA,
    });
    expect(out).toEqual({ created: [], duplicates: [], failures: [] });
    expect(client.from).not.toHaveBeenCalled();
  });
});
