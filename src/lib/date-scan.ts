/**
 * Detector used by the date-format regression tests: finds dates in rendered
 * text (screens, CSV exports, print/PDF output) that are NOT day-first.
 *
 * A `a/b/c` token is provably month-first when its second segment exceeds 12
 * (e.g. 03/14/2026) or its first segment exceeds 31.
 */

const DATE_TOKEN = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const SHORT_TOKEN = /\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g;

export function findFullDateTokens(text: string): string[] {
  return [...text.matchAll(DATE_TOKEN)].map((m) => m[0]);
}

export function monthFirstOffenders(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(DATE_TOKEN)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b > 12 || a > 31) bad.push(m[0]);
  }
  for (const m of text.matchAll(SHORT_TOKEN)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Only judge tokens shaped like a day/month pair (skips ratios, fractions).
    if (a <= 31 && b > 12 && b <= 31) bad.push(m[0]);
  }
  return [...new Set(bad)];
}

/** Zero-padded day-first shape check for any full date shown to a user. */
export function isPaddedDayFirst(token: string): boolean {
  return /^\d{2}\/\d{2}\/(\d{2}|\d{4})$/.test(token);
}
