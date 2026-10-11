/**
 * Mirrors the database `normalize_profile_name_case` trigger so imports and
 * previews show exactly what will be saved: trimmed, single-spaced UPPERCASE.
 */
export function normalizeStaffName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.replace(/\s+/g, " ").trim().toUpperCase();
  return v === "" ? null : v;
}

/** Key used to spot duplicate people regardless of case or spacing. */
export function staffNameKey(first?: string | null, last?: string | null, other?: string | null): string {
  return [first, other, last].map(normalizeStaffName).filter(Boolean).join(" ");
}

/** Normalise a batch of rows and drop duplicates by staff ID (or name when no ID). */
export function dedupeStaffRows<T extends { staff_id?: string | null; first_name?: string | null; last_name?: string | null; other_names?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const n = { ...r, first_name: normalizeStaffName(r.first_name), last_name: normalizeStaffName(r.last_name), other_names: normalizeStaffName(r.other_names) };
    const key = r.staff_id?.trim().toUpperCase() || `name:${staffNameKey(r.first_name, r.last_name, r.other_names)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
