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

// Each psql call spawns a process and round-trips to Postgres, so give the
// suite a generous timeout to absorb cold-start latency.
describeIfDb("normalize_gps_location trigger", { timeout: 30_000 }, () => {
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

      // The trigger only validates values that "look digital" (XX-###-#### at
      // the start, followed by space / "(" / end-of-string). Strings that fail
      // that heuristic are treated as free-form landmark text and preserved
      // as-is (just trimmed/whitespace-collapsed). The next two tests pin
      // that contract down so we'd notice if it ever changed.
      it("treats short/odd codes as free-form (not digital)", () => {
        // 2 digits in the middle group → not recognised as digital → preserved.
        expect(probeLocation(table, "ga-12-4567")).toBe("ga-12-4567");
      });

      it("treats trailing-junk codes as free-form (not digital)", () => {
        expect(probeLocation(table, "GA-123-4567X")).toBe("GA-123-4567X");
      });

      it("rejects digital prefix with bad coords suffix", () => {
        expect(() => probeLocation(table, "ga-123-4567 (foo, bar)")).toThrow(
          /Invalid GPS digital address format/i,
        );
      });
    },
  );

  // Lightweight performance smoke-test: bulk-insert hundreds of varied GPS
  // values through the trigger and assert the average per-row trigger time
  // stays within an acceptable threshold. Everything runs inside a single
  // transaction that is rolled back, so nothing is persisted.
  describe("performance", () => {
    const BULK_ROWS = 500;
    // Generous ceilings — these are smoke thresholds, not micro-benchmarks.
    // They guard against an order-of-magnitude regression (e.g. someone
    // adding a per-row subquery to the trigger).
    const MAX_TOTAL_MS = 5_000; // entire bulk insert, server-side
    const MAX_AVG_MS_PER_ROW = 8; // per-row average through the trigger

    it(`normalises ${BULK_ROWS} rows within performance budget`, () => {
      // Build a VALUES list mixing every shape the trigger handles:
      // lowercase digital, uppercase digital, digital + coords, free-form
      // landmark text, and surrounding whitespace.
      const samples: string[] = [];
      for (let i = 0; i < BULK_ROWS; i++) {
        const region = ["GA", "AK", "GS", "CR", "WR"][i % 5];
        const mid = String(100 + (i % 900)).padStart(3, "0");
        const tail = String(1000 + ((i * 13) % 9000)).padStart(4, "0");
        const variant = i % 5;
        if (variant === 0) {
          samples.push(`${region.toLowerCase()}-${mid}-${tail}`);
        } else if (variant === 1) {
          samples.push(`  ${region}-${mid}-${tail}  `);
        } else if (variant === 2) {
          const lat = (5 + (i % 100) / 100).toFixed(6);
          const lng = (-0.1 - (i % 100) / 1000).toFixed(6);
          samples.push(
            `${region.toLowerCase()}-${mid}-${tail}   (${lat}, ${lng})`,
          );
        } else if (variant === 3) {
          samples.push(`Amasaman   Barrier #${i}`);
        } else {
          samples.push(`Pokuase Junction stop ${i}`);
        }
      }

      // Single multi-row INSERT — exercises the BEFORE trigger once per row
      // but only one round-trip from the test process to Postgres.
      const valuesSql = samples
        .map(
          (s) =>
            `('patrol', CURRENT_DATE, '00000000-0000-0000-0000-000000000000'::uuid, $lov$${s.replace(
              /\$lov\$/g,
              "",
            )}$lov$)`,
        )
        .join(",\n");

      const sql = `
        BEGIN;
        DO $$
        DECLARE
          _start timestamptz := clock_timestamp();
          _elapsed_ms numeric;
        BEGIN
          INSERT INTO public.enforcement_operations
            (operation_type, operation_date, reported_by, location)
          VALUES
            ${valuesSql};
          _elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - _start)) * 1000;
          RAISE NOTICE 'BULK_TRIGGER_MS=%', _elapsed_ms;
        END
        $$;
        ROLLBACK;
      `;

      const wallStart = Date.now();
      const res = runSql(sql);
      const wallMs = Date.now() - wallStart;

      if (!res.ok) {
        throw new Error(res.stderr || "psql failed during bulk insert");
      }

      // Extract the server-side elapsed time from the NOTICE message.
      const noticeMatch = /BULK_TRIGGER_MS=([0-9]+(?:\.[0-9]+)?)/.exec(
        res.stderr,
      );
      const serverMs = noticeMatch ? parseFloat(noticeMatch[1]) : NaN;
      expect(Number.isFinite(serverMs)).toBe(true);

      const avgMsPerRow = serverMs / BULK_ROWS;

      // Surface the numbers so a regression run shows the actual timings.
      // eslint-disable-next-line no-console
      console.log(
        `[gps-trigger perf] rows=${BULK_ROWS} server=${serverMs.toFixed(
          1,
        )}ms avg=${avgMsPerRow.toFixed(3)}ms/row wall=${wallMs}ms`,
      );

      expect(serverMs).toBeLessThan(MAX_TOTAL_MS);
      expect(avgMsPerRow).toBeLessThan(MAX_AVG_MS_PER_ROW);
    });
  });
});
