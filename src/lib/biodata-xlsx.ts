/**
 * PERSONNEL BIO-DATA & SERVICE RECORD — Excel (.xlsx) builder.
 *
 * A cover sheet plus one worksheet per lettered section. Cells are sanitised
 * with the shared spreadsheet-safety helper so no value can be read as a
 * formula. Heavy library loaded on demand.
 */
import { format } from "date-fns";
import { sanitizeCsvValue } from "@/lib/csv-safe";
import type { BioDataRecord } from "@/lib/biodata-record";
import { txt } from "@/lib/biodata-record";

const safeSheetName = (raw: string, used: Set<string>) => {
  let name = raw.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Section";
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${name.slice(0, 26)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
};

const widthsFor = (rows: string[][]) => {
  const cols = Math.max(...rows.map((r) => r.length), 1);
  return Array.from({ length: cols }, (_, i) => ({
    wch: Math.min(60, Math.max(12, ...rows.map((r) => (r[i] ?? "").length + 2))),
  }));
};

export async function buildBioDataXlsxBlob(record: BioDataRecord): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const addSheet = (name: string, rows: string[][]) => {
    const clean = rows.map((r) => r.map((c) => sanitizeCsvValue(c)));
    const ws = XLSX.utils.aoa_to_sheet(clean);
    (ws as any)["!cols"] = widthsFor(clean);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));
  };

  addSheet("Cover", [
    ["PERSONNEL BIO-DATA & SERVICE RECORD"],
    ["CONFIDENTIAL — FOR OFFICIAL USE ONLY"],
    [],
    ["Name", record.fullName || "Unnamed"],
    ["Staff ID", record.staffId],
    ["Generated", format(new Date(), "dd/MM/yyyy HH:mm")],
  ]);

  for (const s of record.sections) {
    const title = `${s.letter} ${s.title}`;
    const header: string[][] = [
      [`${s.letter}. ${s.title}${s.note ? ` — ${s.note}` : ""}`],
      [],
    ];
    if (s.kind === "pairs") {
      addSheet(title, [
        ...header,
        ["Field", "Value"],
        ...(s.pairs.length ? s.pairs.map(([k, v]) => [String(k), txt(v)]) : [["—", "—"]]),
      ]);
    } else {
      addSheet(title, [
        ...header,
        s.head,
        ...(s.rows.length ? s.rows.map((r) => s.head.map((_, i) => txt(r[i]))) : [s.head.map(() => "—")]),
      ]);
    }
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
