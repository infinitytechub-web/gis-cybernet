/**
 * PERSONNEL BIO-DATA & SERVICE RECORD — flat CSV builder.
 *
 * One row per field: Section, Field, Value. Every cell is passed through the
 * shared spreadsheet-safety helper so no exported value can be interpreted as
 * a formula when the file is opened in Excel / Sheets / LibreOffice.
 */
import { buildCsv } from "@/lib/csv-safe";
import type { BioDataRecord } from "@/lib/biodata-record";
import { txt } from "@/lib/biodata-record";

export function buildBioDataCsv(record: BioDataRecord): string {
  const rows: string[][] = [];
  for (const s of record.sections) {
    const section = `${s.letter}. ${s.title}`;
    if (s.kind === "pairs") {
      for (const [k, v] of s.pairs) rows.push([section, String(k), txt(v)]);
    } else {
      if (!s.rows.length) {
        rows.push([section, "—", "—"]);
        continue;
      }
      s.rows.forEach((r, idx) => {
        s.head.forEach((h, i) => {
          rows.push([section, `#${idx + 1} ${h}`, txt(r[i])]);
        });
      });
    }
  }
  return buildCsv(["Section", "Field", "Value"], rows);
}
