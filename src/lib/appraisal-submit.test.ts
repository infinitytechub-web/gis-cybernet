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

describe("atomic appraisal submission", () => {
  const payloadBase = { appraised_by: "reviewer", period_year: 2026, period_month: 11, status: "submitted" as const, comments: null, submitted_at: null };
  const scores = { job_knowledge: 4, quality_of_work: 5 };
  it("reports success, duplicate and denial separately through atomic server saves", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({data:"ap-1",error:null}).mockResolvedValueOnce({data:null,error:{code:"23505",message:"duplicate"}}).mockResolvedValueOnce({data:null,error:{message:"Not authorized"}});
    const client={from:vi.fn(),rpc};
    const out=await submitBulkAppraisals(client,{targetIds:["ok","dup","denied"],payloadBase,scores,criteria:CRITERIA});
    expect(out.created).toEqual(["ok"]); expect(out.duplicates).toEqual(["dup"]); expect(out.failures).toEqual(["denied: Not authorized"]);
    expect(client.from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("appraisal_save",expect.objectContaining({_profile:"ok",_year:2026,_month:11,_submit:true,_scores:scores}));
  });
  it("does not report a failed atomic score save as created",async()=>{
    const client={from:vi.fn(),rpc:vi.fn().mockResolvedValue({data:null,error:{message:"All seven criteria are required"}})};
    const out=await submitBulkAppraisals(client,{targetIds:["officer"],payloadBase,scores,criteria:CRITERIA});
    expect(out.created).toEqual([]);expect(out.failures).toEqual(["officer: All seven criteria are required"]);expect(client.from).not.toHaveBeenCalled();
  });
  it("does not call the server for empty selection",async()=>{
    const client={from:vi.fn(),rpc:vi.fn()};expect(await submitBulkAppraisals(client,{targetIds:[],payloadBase,scores,criteria:CRITERIA})).toEqual({created:[],duplicates:[],failures:[]});expect(client.rpc).not.toHaveBeenCalled();
  });
});
