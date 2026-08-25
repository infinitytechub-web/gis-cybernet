/**
 * Shared CSV cell sanitisation.
 *
 * Spreadsheet applications (Excel, Google Sheets, LibreOffice) treat any cell
 * beginning with `=`, `+`, `-`, `@`, or a leading tab / carriage return as a
 * formula. Free-text fields in this app (leave reasons, incident notes, staff
 * names from bulk uploads, procurement remarks, …) are later exported to CSV by
 * commanders, so a crafted value could exfiltrate data or trigger DDE on legacy
 * Excel. Every CSV export path must run values through `sanitizeCsvValue` (or
 * the combined `csvCell`) before writing them out.
 */

const RISKY_LEADING = /^[=+\-@\t\r]/;

/** Neutralise formula-triggering leading characters by prefixing an apostrophe. */
export function sanitizeCsvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : Array.isArray(v) ? v.join("; ") : String(v);
  return RISKY_LEADING.test(s) ? `'${s}` : s;
}

/** Sanitise + RFC-4180 quote a value for direct CSV concatenation. */
export function csvCell(v: unknown): string {
  const s = sanitizeCsvValue(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Always-quoted variant, for exports that quote every cell. */
export function csvCellQuoted(v: unknown): string {
  return `"${sanitizeCsvValue(v).replace(/"/g, '""')}"`;
}

/** Build a full CSV document from headers + rows. */
export function buildCsv(headers: unknown[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}
