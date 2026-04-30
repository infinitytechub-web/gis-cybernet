/**
 * CSV / PDF export helpers for the Compliance Management bulk-upload audit log.
 * Reuses the same filtered, RLS-restricted rows the dialog displays — never a wider set.
 */
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";
import { format } from "date-fns";

export interface AuditExportRow {
  created_at: string;
  batch_id: string;
  kind: string;
  outcome: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  error_message: string | null;
  performer_label: string;
  target_label: string;
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportComplianceAuditCSV(rows: AuditExportRow[]): { count: number } {
  const headers = ["Timestamp", "Batch", "Kind", "Outcome", "File", "Size (KB)", "MIME", "Performed by", "Target staff", "Error"];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
      r.batch_id.slice(0, 8),
      r.kind,
      r.outcome,
      r.file_name,
      r.file_size != null ? Math.round(r.file_size / 1024) : "",
      r.file_type ?? "",
      r.performer_label,
      r.target_label,
      r.error_message ?? "",
    ].map(csvCell).join(","));
  }
  const csv = "\uFEFF" + lines.join("\r\n");
  const filename = `compliance-upload-audit-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
  downloadCSVString(csv, filename);
  return { count: rows.length };
}

export async function exportComplianceAuditPDF(rows: AuditExportRow[], filterSummary: string[]): Promise<{ count: number }> {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Compliance Management — Bulk Upload Audit", 40, 40);

  doc.setFontSize(9);
  const summary = [...filterSummary, `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, `Rows: ${rows.length}`];
  doc.text(summary.join("  ·  "), 40, 58);

  autoTable(doc, {
    startY: 75,
    head: [["When", "Kind", "Outcome", "File", "Size", "Performed by", "Target", "Error"]],
    body: rows.map((r) => [
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      r.kind,
      r.outcome.toUpperCase(),
      r.file_name,
      r.file_size != null ? `${Math.round(r.file_size / 1024)} KB` : "—",
      r.performer_label,
      r.target_label,
      r.error_message ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [22, 78, 47], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 70 },
      2: { cellWidth: 60 },
      3: { cellWidth: 160 },
      4: { cellWidth: 50 },
      5: { cellWidth: 110 },
      6: { cellWidth: 110 },
      7: { cellWidth: "auto" },
    },
    didDrawPage: () => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.text(`CONFIDENTIAL · Page ${currentPage} of ${pageCount}`, 40, doc.internal.pageSize.getHeight() - 20);
    },
  });

  const filename = `compliance-upload-audit-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
  const blob = doc.output("blob");
  downloadBlob(blob, filename);
  return { count: rows.length };
}
