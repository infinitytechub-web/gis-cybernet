import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { format } from "date-fns";

type Profile = { first_name?: string; last_name?: string; staff_id?: string };

function header(doc: jsPDF, title: string) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("GIS HEALTH LAB", 105, 18, { align: "center" });
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
    ["Visit date", record.visit_date ? format(new Date(record.visit_date), "dd MMM yyyy") : "—"],
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
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 20, 285);
  doc.save(`medical_record_${(profile?.staff_id ?? "record")}_${format(new Date(record.visit_date ?? new Date()), "yyyyMMdd")}.pdf`);
}

export async function exportMedicalRecordDOCX(record: any, profile?: Profile | null) {
  const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "GIS HEALTH LAB – Medical Record", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · Medical Services")] }),
        new Paragraph({ children: [new TextRun("")] }),
        kv("Officer:", profile ? `${profile.last_name}, ${profile.first_name}` : "—"),
        kv("Staff ID:", profile?.staff_id ?? "—"),
        kv("Visit date:", record.visit_date ? format(new Date(record.visit_date), "dd MMM yyyy") : "—"),
        kv("Chief complaint:", record.chief_complaint ?? "—"),
        kv("Diagnosis:", record.diagnosis ?? "—"),
        kv("Treatment:", record.treatment ?? "—"),
        kv("Notes:", record.notes ?? "—"),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, italics: true, size: 18 })] }),
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
    ["Report date", report.report_date ? format(new Date(report.report_date), "dd MMM yyyy") : "—"],
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
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 20, 285);
  doc.save(`health_report_${format(new Date(report.report_date ?? new Date()), "yyyyMMdd")}.pdf`);
}

export async function exportHealthReportDOCX(report: any) {
  const kv = (k: string, v: string) => new Paragraph({ children: [new TextRun({ text: k + " ", bold: true }), new TextRun(v || "—")] });
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "GIS HEALTH LAB – Health Report", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ghana Immigration Service · Medical Services")] }),
        new Paragraph({ children: [new TextRun("")] }),
        kv("Title:", report.title ?? "—"),
        kv("Category:", report.category ?? "—"),
        kv("Report date:", report.report_date ? format(new Date(report.report_date), "dd MMM yyyy") : "—"),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Summary", bold: true })] }),
        new Paragraph({ children: [new TextRun(report.summary || "—")] }),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, italics: true, size: 18 })] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(docx);
  saveAs(blob, `health_report_${format(new Date(report.report_date ?? new Date()), "yyyyMMdd")}.docx`);
}
