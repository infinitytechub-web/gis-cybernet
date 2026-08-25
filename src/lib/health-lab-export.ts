import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { format } from "date-fns";

type Profile = { first_name?: string; last_name?: string; staff_id?: string };

function header(doc: jsPDF, title: string) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("HEALTH LAB+", 105, 18, { align: "center" });
  doc.setFontSize(13); doc.text(title, 105, 26, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Ghana Immigration Service · Medical Services", 105, 32, { align: "center" });
  doc.line(15, 36, 195, 36);
}

export function exportMedicalRecordPDF(record: any, profile?: Profile | null) {
  const doc = new jsPDF();
  header(doc, "Medical Record");
  let y = 46;
  const rows: [string, string][] = [
    ["Officer", profile ? `${profile.last_name}, ${profile.first_name}` : "—"],
    ["Staff ID", profile?.staff_id ?? "—"],
    ["Visit date", record.visit_date ? format(new Date(record.visit_date), "dd/MM/yyyy") : "—"],
    ["Chief complaint", record.chief_complaint ?? "—"],
    ["Diagnosis", record.diagnosis ?? "—"],
    ["Treatment", record.treatment ?? "—"],
    ["Notes", record.notes ?? "—"],
  ];
  doc.setFontSize(11);
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold"); doc.text(`${k}:`, 20, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(v), 130);
    doc.text(lines, 60, y);
    y += Math.max(7, lines.length * 6);
  });
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 285);
  doc.save(`medical_record_${(profile?.staff_id ?? "record")}_${format(new Date(record.visit_date ?? new Date()), "yyyyMMdd")}.pdf`);
}

export async function exportMedicalRecordDOCX(record: any, profile?: Profile | null) {
  const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "HEALTH LAB+ – Medical Record", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · Medical Services")] }),
        new Paragraph({ children: [new TextRun("")] }),
        kv("Officer:", profile ? `${profile.last_name}, ${profile.first_name}` : "—"),
        kv("Staff ID:", profile?.staff_id ?? "—"),
        kv("Visit date:", record.visit_date ? format(new Date(record.visit_date), "dd/MM/yyyy") : "—"),
        kv("Chief complaint:", record.chief_complaint ?? "—"),
        kv("Diagnosis:", record.diagnosis ?? "—"),
        kv("Treatment:", record.treatment ?? "—"),
        kv("Notes:", record.notes ?? "—"),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, italics: true, size: 18 })] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(docx);
  saveAs(blob, `medical_record_${(profile?.staff_id ?? "record")}_${format(new Date(record.visit_date ?? new Date()), "yyyyMMdd")}.docx`);
}

export function exportHealthReportPDF(report: any) {
  const doc = new jsPDF();
  header(doc, "Health Report");
  let y = 46;
  const rows: [string, string][] = [
    ["Title", report.title ?? "—"],
    ["Category", report.category ?? "—"],
    ["Report date", report.report_date ? format(new Date(report.report_date), "dd/MM/yyyy") : "—"],
  ];
  doc.setFontSize(11);
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold"); doc.text(`${k}:`, 20, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v), 60, y); y += 7;
  });
  y += 4;
  doc.setFont("helvetica", "bold"); doc.text("Summary:", 20, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(report.summary || "—", 170), 20, y);
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 285);
  doc.save(`health_report_${format(new Date(report.report_date ?? new Date()), "yyyyMMdd")}.pdf`);
}

export async function exportHealthReportDOCX(report: any) {
  const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "HEALTH LAB+ – Health Report", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · Medical Services")] }),
        new Paragraph({ children: [new TextRun("")] }),
        kv("Title:", report.title ?? "—"),
        kv("Category:", report.category ?? "—"),
        kv("Report date:", report.report_date ? format(new Date(report.report_date), "dd/MM/yyyy") : "—"),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Summary", bold: true })] }),
        new Paragraph({ children: [new TextRun(report.summary || "—")] }),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, italics: true, size: 18 })] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(docx);
  saveAs(blob, `health_report_${format(new Date(report.report_date ?? new Date()), "yyyyMMdd")}.docx`);
}

// ─── List exports for filtered/paginated views ────────────────────────────
import { csvCell } from "@/lib/csv-safe";

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, filename);
}

export function exportRecordsCSV(records: any[], profileMap: Record<string, any>, suffix = "filtered") {
  const rows: string[][] = [["Visit date", "Staff ID", "Officer", "Chief complaint", "Diagnosis", "Treatment", "Notes"]];
  records.forEach((r) => {
    const p = profileMap[r.staff_profile_id];
    rows.push([
      r.visit_date ? format(new Date(r.visit_date), "yyyy-MM-dd") : "",
      p?.staff_id ?? "",
      p ? `${p.last_name}, ${p.first_name}` : "",
      r.chief_complaint ?? "",
      r.diagnosis ?? "",
      r.treatment ?? "",
      r.notes ?? "",
    ]);
  });
  downloadCSV(`medical_records_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`, rows);
}

export function exportReportsCSV(reports: any[], suffix = "filtered") {
  const rows: string[][] = [["Report date", "Title", "Category", "Summary", "File"]];
  reports.forEach((r) => {
    rows.push([
      r.report_date ? format(new Date(r.report_date), "yyyy-MM-dd") : "",
      r.title ?? "",
      r.category ?? "",
      r.summary ?? "",
      r.file_name ?? "",
    ]);
  });
  downloadCSV(`health_reports_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`, rows);
}

function tablePDF(title: string, headers: string[], rows: string[][], filename: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  header(doc, title);
  let y = 46;
  const colWidths = headers.map(() => Math.floor(265 / headers.length));
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  let x = 15;
  headers.forEach((h, i) => { doc.text(h, x + 1, y); x += colWidths[i]; });
  doc.line(15, y + 2, 280, y + 2);
  y += 6;
  doc.setFont("helvetica", "normal");
  rows.forEach((r) => {
    if (y > 195) { doc.addPage({ orientation: "landscape" } as any); y = 20; }
    let xi = 15;
    let maxLines = 1;
    r.forEach((cell, i) => {
      const lines = doc.splitTextToSize(String(cell ?? ""), colWidths[i] - 2);
      doc.text(lines, xi + 1, y);
      maxLines = Math.max(maxLines, lines.length);
      xi += colWidths[i];
    });
    y += maxLines * 4 + 2;
  });
  doc.setFont("helvetica", "italic"); doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")} · ${rows.length} rows`, 15, 200);
  doc.save(filename);
}

export function exportRecordsPDF(records: any[], profileMap: Record<string, any>, suffix = "filtered") {
  const rows = records.map((r) => {
    const p = profileMap[r.staff_profile_id];
    return [
      r.visit_date ? format(new Date(r.visit_date), "dd/MM/yyyy") : "",
      p?.staff_id ?? "",
      p ? `${p.last_name}, ${p.first_name}` : "",
      r.diagnosis ?? "",
      r.treatment ?? "",
      r.notes ?? "",
    ];
  });
  tablePDF("Medical Records", ["Date", "Staff ID", "Officer", "Diagnosis", "Treatment", "Notes"], rows,
    `medical_records_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
}

export function exportReportsPDF(reports: any[], suffix = "filtered") {
  const rows = reports.map((r) => [
    r.report_date ? format(new Date(r.report_date), "dd/MM/yyyy") : "",
    r.title ?? "",
    r.category ?? "",
    r.summary ?? "",
  ]);
  tablePDF("Health Reports", ["Date", "Title", "Category", "Summary"], rows,
    `health_reports_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
}

// ---------- Inventory audit log exports ----------
function actorName(actorMap: Record<string, any>, uid?: string | null) {
  if (!uid) return "system";
  const a = actorMap[uid];
  return a ? `${a.last_name}, ${a.first_name}${a.staff_id ? ` (${a.staff_id})` : ""}` : uid.slice(0, 8);
}

export function exportAuditCSV(rows: any[], actorMap: Record<string, any>, suffix = "filtered") {
  const csvRows: string[][] = [["When", "Action", "Item", "Δ", "Qty before", "Qty after", "Performed by", "Note"]];
  rows.forEach((a) => {
    csvRows.push([
      a.performed_at ? format(new Date(a.performed_at), "yyyy-MM-dd HH:mm") : "",
      a.action ?? "",
      a.item_name ?? "",
      a.delta != null ? String(a.delta) : "",
      a.quantity_before != null ? String(a.quantity_before) : "",
      a.quantity_after != null ? String(a.quantity_after) : "",
      actorName(actorMap, a.performed_by),
      a.note ?? "",
    ]);
  });
  downloadCSV(`inventory_audit_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`, csvRows);
}

export function exportAuditPDF(rows: any[], actorMap: Record<string, any>, suffix = "filtered") {
  const pdfRows = rows.map((a) => [
    a.performed_at ? format(new Date(a.performed_at), "dd/MM/yy HH:mm") : "",
    a.action ?? "",
    a.item_name ?? "",
    a.delta != null ? (a.delta > 0 ? `+${a.delta}` : String(a.delta)) : "",
    `${a.quantity_before ?? "—"} → ${a.quantity_after ?? "—"}`,
    actorName(actorMap, a.performed_by),
    a.note ?? "",
  ]);
  tablePDF("Inventory Audit Log",
    ["When", "Action", "Item", "Δ", "Qty", "By", "Note"], pdfRows,
    `inventory_audit_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
}

export async function exportAuditDOCX(rows: any[], actorMap: Record<string, any>, suffix = "filtered") {
  const lines: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "HEALTH LAB+ – Inventory Audit Log", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · Medical Services")] }),
    new Paragraph({ children: [new TextRun("")] }),
  ];
  rows.forEach((a) => {
    lines.push(new Paragraph({
      children: [
        new TextRun({ text: `${a.performed_at ? format(new Date(a.performed_at), "dd/MM/yy HH:mm") : "—"} · `, bold: true }),
        new TextRun({ text: `${(a.action ?? "").toUpperCase()} `, bold: true }),
        new TextRun(`${a.item_name ?? "—"} `),
        new TextRun(a.delta != null ? `(Δ ${a.delta > 0 ? "+" : ""}${a.delta}) ` : ""),
        new TextRun(`[${a.quantity_before ?? "—"} → ${a.quantity_after ?? "—"}] `),
        new TextRun(`by ${actorName(actorMap, a.performed_by)}`),
        ...(a.note ? [new TextRun({ text: ` — ${a.note}`, italics: true })] : []),
      ],
    }));
  });
  lines.push(new Paragraph({ children: [new TextRun("")] }));
  lines.push(new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")} · ${rows.length} entries`, italics: true, size: 18 })] }));
  const docx = new Document({ sections: [{ children: lines }] });
  const blob = await Packer.toBlob(docx);
  saveAs(blob, `inventory_audit_${suffix}_${format(new Date(), "yyyyMMdd_HHmm")}.docx`);
}
