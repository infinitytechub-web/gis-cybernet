// Exports for guard schedule (XLSX, CSV, PDF)
import * as XLSX from "xlsx";
import { downloadBlob } from "@/lib/download-utils";
import { formatDateTime } from "@/lib/date-format";

export type Assignment = {
  id: string;
  duty_date: string;
  shift: "A" | "B" | "C" | "D";
  rank_text: string | null;
  name_text: string;
  serial_no: number | null;
  unit: string | null;
  position_label: string | null;
};

export type ScheduleHeader = {
  name: string;
  start_date: string;
  end_date: string;
  status: string;
};

const SHIFT_HOURS: Record<string, string> = {
  A: "06:00 – 14:00",
  B: "14:00 – 22:00",
  C: "22:00 – 06:00",
  D: "Operational (24/7)",
};

function rowsForExport(assignments: Assignment[]) {
  return assignments
    .slice()
    .sort(
      (a, b) =>
        a.duty_date.localeCompare(b.duty_date) ||
        a.shift.localeCompare(b.shift) ||
        (a.serial_no ?? 0) - (b.serial_no ?? 0)
    )
    .map((a) => ({
      Date: a.duty_date,
      Shift: a.shift,
      Hours: SHIFT_HOURS[a.shift] ?? "",
      "S/N": a.serial_no ?? "",
      Rank: a.rank_text ?? "",
      Name: a.name_text,
      Unit: a.unit ?? "",
      Position: a.position_label ?? "",
    }));
}

export function exportScheduleXlsx(header: ScheduleHeader, assignments: Assignment[]) {
  const wb = XLSX.utils.book_new();
  const all = rowsForExport(assignments);
  const allWs = XLSX.utils.json_to_sheet(all);
  XLSX.utils.book_append_sheet(wb, allWs, "All");
  for (const s of ["A", "B", "C", "D"] as const) {
    const ws = XLSX.utils.json_to_sheet(all.filter((r) => r.Shift === s));
    XLSX.utils.book_append_sheet(wb, ws, `Shift ${s}`);
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${slug(header.name)}_${header.start_date}_${header.end_date}.xlsx`);
}

export function exportScheduleCsv(header: ScheduleHeader, assignments: Assignment[]) {
  const rows = rowsForExport(assignments);
  if (!rows.length) {
    downloadBlob(new Blob([""], { type: "text/csv" }), `${slug(header.name)}.csv`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const escape = (v: any) => csvCell(v);
  const header_row = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape((r as any)[c])).join(",")).join("\n");
  const meta =
    `# Schedule: ${header.name}\n# Range: ${header.start_date} → ${header.end_date}\n# Status: ${header.status}\n# Exported: ${new Date().toISOString()}\n`;
  downloadBlob(
    new Blob([meta + header_row + "\n" + body], { type: "text/csv;charset=utf-8" }),
    `${slug(header.name)}_${header.start_date}_${header.end_date}.csv`
  );
}

export async function exportSchedulePdf(header: ScheduleHeader, assignments: Assignment[]) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Guard Schedule — ${header.name}`, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Range: ${header.start_date} → ${header.end_date}    Status: ${header.status.toUpperCase()}    Exported: ${formatDateTime(new Date())}`,
    40,
    58
  );

  const rows = rowsForExport(assignments).map((r) => [
    r.Date,
    r.Shift,
    r.Hours,
    r["S/N"],
    r.Rank,
    r.Name,
    r.Unit,
    r.Position,
  ]);

  autoTable(doc, {
    head: [["Date", "Shift", "Hours", "S/N", "Rank", "Name", "Unit", "Position"]],
    body: rows,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [16, 99, 56], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 250, 245] },
    didDrawPage: (data: any) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `CONFIDENTIAL — Cybernet HRM System   |   Page ${page}`,
        40,
        doc.internal.pageSize.getHeight() - 18
      );
    },
  });

  doc.save(`${slug(header.name)}_${header.start_date}_${header.end_date}.pdf`);
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "guard_schedule";
}
