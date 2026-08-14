/**
 * Single source of truth for date DISPLAY formatting.
 *
 * House standard is DD/MM/YYYY across the whole system (screens, prints,
 * exports). Machine-facing values (`yyyy-MM-dd` for database filters, query
 * keys and `<input type="date">` values, plus ISO timestamps) are deliberately
 * NOT routed through here — they must stay ISO.
 */
import { format, isValid, parseISO, differenceInYears, differenceInMonths } from "date-fns";

export const DATE_FORMAT = "dd/MM/yyyy";
export const DATE_TIME_FORMAT = "dd/MM/yyyy HH:mm";
export const DATE_FORMAT_HINT = "DD/MM/YYYY";

/** Safe parse for anything the API may hand us (Date | ISO string | null). */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  const loose = new Date(value);
  return isValid(loose) ? loose : null;
}

/** dd/MM/yyyy — returns `fallback` when the value is missing/invalid. */
export function formatDate(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? format(d, DATE_FORMAT) : fallback;
}

/** dd/MM/yyyy HH:mm */
export function formatDateTime(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? format(d, DATE_TIME_FORMAT) : fallback;
}

/** dd/MM/yyyy with a weekday prefix, for letter heads and report banners. */
export function formatDateLong(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? format(d, "EEEE, dd/MM/yyyy") : fallback;
}

/** HH:mm only. */
export function formatTime(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? format(d, "HH:mm") : fallback;
}

/* ----------------------------- Age calculator ----------------------------- */

export type AgeResult =
  | { ok: true; years: number; months: number; label: string }
  | { ok: false; reason: "empty" | "invalid" | "future" };

/**
 * Current age from a date of birth. Infants (< 1 year) report months so the
 * intake record is still meaningful for minors.
 */
export function calculateAge(dob: Date | string | null | undefined, now: Date = new Date()): AgeResult {
  if (dob === null || dob === undefined || dob === "") return { ok: false, reason: "empty" };
  const d = toDate(dob);
  if (!d) return { ok: false, reason: "invalid" };
  if (d.getTime() > now.getTime()) return { ok: false, reason: "future" };
  const years = differenceInYears(now, d);
  const months = differenceInMonths(now, d) - years * 12;
  const label =
    years >= 1
      ? `${years} yr${years === 1 ? "" : "s"}${months > 0 ? ` ${months} mo` : ""}`
      : `${months} month${months === 1 ? "" : "s"}`;
  return { ok: true, years, months, label };
}

/** Convenience: "34 yrs" / "—" for tables and read-only views. */
export function ageLabel(dob: Date | string | null | undefined, fallback = "—"): string {
  const a = calculateAge(dob);
  return a.ok ? a.label : fallback;
}

/** Standard demographic bucket used by analytics dashboards. */
export function ageGroup(dob: Date | string | null | undefined): string {
  const a = calculateAge(dob);
  if (!a.ok) return "Unknown";
  if (a.years < 18) return "Under 18";
  if (a.years <= 25) return "18–25";
  if (a.years <= 35) return "26–35";
  if (a.years <= 45) return "36–45";
  if (a.years <= 60) return "46–60";
  return "60+";
}
