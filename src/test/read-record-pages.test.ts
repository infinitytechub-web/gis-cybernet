import { describe, expect, it } from "vitest";
import { readRecordPages } from "@/lib/read-record-pages";

describe("authorized record pages", () => {
  it("retains all records beyond the previous 2,000 application cap", async () => {
    const records = Array.from({ length: 2026 }, (_, id) => ({ id }));
    const result = await readRecordPages(async (from, to) => ({ data: records.slice(from, to + 1), error: null }));
    expect(result).toEqual(records);
    expect(result[2025].id).toBe(2025);
  });
  it("rejects an incomplete later page instead of showing partial totals", async () => {
    const error = new Error("Permission denied");
    await expect(readRecordPages(async (from) => from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => id), error: null }
      : { data: null, error })).rejects.toBe(error);
  });
  it("accepts a genuinely empty result", async () => {
    await expect(readRecordPages(async () => ({ data: [], error: null }))).resolves.toEqual([]);
  });
  it("rejects unavailable data", async () => {
    await expect(readRecordPages(async () => ({ data: null, error: null }))).rejects.toThrow("Records unavailable");
  });
});