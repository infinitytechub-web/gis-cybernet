// Cybernet HRM System — automated shift rotation utility (4-day cycle, 2026).
// Source: AMASAMAN_COMMAND_SHIFT_SYSTEM_2026 (published roster).
// Pattern: every calendar day advances one letter through A → B → C → D
// then back to A. Anchor point verified against the published PDF:
//   2026-05-01 (Fri) = A
//   2026-05-02 (Sat) = B
//   2026-05-03 (Sun) = C
//   2026-05-04 (Mon) = D
//   2026-05-05 (Tue) = A   …and so on through Dec 31.
// We use UTC midnights for both the anchor and the queried day so DST /
// timezone shifts can never bump a date into the wrong slot.

import { differenceInCalendarDays } from "date-fns";

export type ShiftGroup = "A" | "B" | "C" | "D";
export const SHIFT_GROUPS: ShiftGroup[] = ["A", "B", "C", "D"];

// Friday, 1 May 2026 (UTC) = Group A. Anchor verified across all 8 PDF pages.
const ANCHOR = new Date(Date.UTC(2026, 4, 1));

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Returns the on-duty shift group for any calendar date. */
export function getShiftGroupForDate(date: Date): ShiftGroup {
  const diff = differenceInCalendarDays(toUtcMidnight(date), ANCHOR);
  // (% in JS can be negative — normalise.)
  const idx = ((diff % 4) + 4) % 4;
  return SHIFT_GROUPS[idx];
}

/** True if the given staff member is on duty on the given date. */
export function isOnDuty(date: Date, staffGroup: string | null | undefined): boolean {
  if (!staffGroup) return false;
  return getShiftGroupForDate(date) === staffGroup.toUpperCase();
}

/** Visual tone for each group — kept in sync with MyShiftTracker palette. */
export const GROUP_COLORS: Record<ShiftGroup, { bg: string; text: string; border: string; solid: string }> = {
  A: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/40", solid: "bg-emerald-500" },
  B: { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300", border: "border-sky-500/40", solid: "bg-sky-500" },
  C: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/40", solid: "bg-amber-500" },
  D: { bg: "bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", border: "border-violet-500/40", solid: "bg-violet-500" },
};
