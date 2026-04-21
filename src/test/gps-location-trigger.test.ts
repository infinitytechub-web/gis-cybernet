// Integration tests for the `normalize_gps_location` Postgres trigger.
//
// The trigger lives on `enforcement_operations` and `operations` and:
//  1. Trims surrounding whitespace and collapses internal whitespace runs.
//  2. Uppercases values that look like a Ghana Post digital address.
//  3. Validates the canonical formats `XX-###-####` and
//     `XX-###-#### (lat, lng)`. Anything that *looks* digital but doesn't
//     match must be rejected.
//  4. Leaves free-form landmark text alone (just trimmed).
//
// We exercise the trigger by piping SQL into `psql` inside a single
// transaction that is always rolled back, so nothing is persisted.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const HAS_PG = !!process.env.PGHOST;

function runSql(sql: string): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync(
    "psql",
    ["-X", "-A", "-t", "-q", "--set", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  return {
    ok: res.status === 0,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

/**
 * Try to insert a row into the given table with the supplied raw `location`,
 * read back the normalised value, then roll the whole thing back.
 *
 * Resolves with the trigger's stored value on success, or throws an Error
 * carrying the trigger's RAISE EXCEPTION message on failure.
 */
function probeLocation(
  table: "enforcement_operations" | "operations",
  raw: string | null,
): string | null {
  // Use dollar-quoting so we don't have to escape user input.
  const literal =
    raw === null ? "NULL" : `$lov$${raw.replace(/\$lov\$/g, "")}$lov$`;

  const sql = `
    BEGIN;
    WITH ins AS (
      INSERT INTO public.${table} (operation_type, operation_date, reported_by, location)
      VALUES (
        'patrol',
        CURRENT_DATE,
        '00000000-0000-0000-0000-000000000000'::uuid,
        ${literal}
      )
      RETURNING location
    )
    SELECT COALESCE(location, '__NULL__') FROM ins;
    ROLLBACK;
  `;

  const res = runSql(sql);
  if (!res.ok) {
    throw new Error(res.stderr || "psql failed");
  }
  // psql may emit "ROLLBACK" status lines; the SELECT result is the first non-empty line.
  const firstLine = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && l !== "ROLLBACK" && l !== "BEGIN");
  if (!firstLine) return null;
  return firstLine === "__NULL__" ? null : firstLine;
}

const describeIfDb = HAS_PG ? describe : describe.skip;

describeIfDb("normalize_gps_location trigger", () => {
  describe.each(["enforcement_operations", "operations"] as const)(
    "%s.location",
    (table) => {
      it("uppercases lowercase digital addresses", () => {
        expect(probeLocation(table, "ga-123-4567")).toBe("GA-123-4567");
      });

      it("trims surrounding whitespace from digital addresses", () => {
        expect(probeLocation(table, "   GA-123-4567   ")).toBe("GA-123-4567");
      });

      it("collapses internal whitespace and uppercases the digital prefix", () => {
        expect(probeLocation(table, "ga-123-4567   (5.612345, -0.187654)")).toBe(
          "GA-123-4567 (5.612345, -0.187654)",
        );
      });

      it("preserves free-form landmark text (just trimmed)", () => {
        expect(probeLocation(table, "  Amasaman  Barrier, Pokuase  ")).toBe(
          "Amasaman Barrier, Pokuase",
        );
      });

      it("normalises empty-string locations to NULL", () => {
        expect(probeLocation(table, "   ")).toBeNull();
      });

      it("accepts NULL locations unchanged", () => {
        expect(probeLocation(table, null)).toBeNull();
      });

      it("rejects malformed digital addresses (too few digits)", () => {
        expect(() => probeLocation(table, "ga-12-4567")).toThrow(
          /Invalid GPS digital address format/i,
        );
      });

      it("rejects malformed digital addresses (extra chars after code)", () => {
        expect(() => probeLocation(table, "GA-123-4567X")).toThrow(
          /Invalid GPS digital address format/i,
        );
      });

      it("rejects digital prefix with bad coords suffix", () => {
        expect(() => probeLocation(table, "ga-123-4567 (foo, bar)")).toThrow(
          /Invalid GPS digital address format/i,
        );
      });
    },
  );
});
