/**
 * Standardized Ghana Immigration Service - Excuse Duty Form templates.
 * Produces both filled (from a submission) and blank printable versions in
 * PDF and DOCX. Used by the Excuse Duty Form page and the Health Lab.
 */
import jsPDF from "jspdf";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import { format } from "date-fns";

export interface ExcuseDutyData {
  staff_name?: string;
  rank?: string;
  staff_id?: string;
  directorate?: string;
  office?: string;
  shift_group?: string;
  phone?: string;
  email?: string;
  start_date?: string;
  end_date?: string;
  doctor_name?: string;
  facility?: string;
  diagnosis?: string;
  reason?: string;
  recommendation?: string;
  status?: string;
  reviewer_name?: string;
  reviewer_rank?: string;
  reviewed_at?: string;
  authorised_by?: string;
  authorised_rank?: string;
  authorised_at?: string;
}

const ORG_TITLE = "GHANA IMMIGRATION SERVICE";
const ORG_SUB = "Amasaman Sector Command";
const FORM_TITLE = "EXCUSE DUTY FORM";

// ─────────────────────────── PDF ───────────────────────────
export function downloadExcuseDutyPDF(data: ExcuseDutyData, blank = false) {
  const v = (x?: string) => (blank ? "" : x && x.trim() ? x : "—");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 15;
  let y = 18;

  // Header
  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text(ORG_TITLE, pageW / 2, y, { align: "center" }); y += 6;
  doc.setFontSize(11).setFont("helvetica", "normal");
  doc.text(ORG_SUB, pageW / 2, y, { align: "center" }); y += 5;
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(FORM_TITLE, pageW / 2, y, { align: "center" }); y += 4;
  doc.setLineWidth(0.4); doc.line(margin, y, pageW - margin, y); y += 6;

  // Section: Officer details (2-col table)
  const drawRow = (k: string, val: string) => {
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(k, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(val, margin + 50, y);
    y += 6;
  };

  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("A. Officer Details", margin, y); y += 5;

  drawRow("Staff Name:", v(data.staff_name));
  drawRow("Rank:", v(data.rank));
  drawRow("Staff ID:", v(data.staff_id));
  drawRow("Directorate / Unit:", v(data.directorate));
  drawRow("Office:", v(data.office));
  drawRow("Shift Group:", v(data.shift_group));
  drawRow("Contact:", blank ? "" : `${data.phone || "—"}${data.email ? " · " + data.email : ""}`);

  y += 2;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("B. Excuse Duty Period", margin, y); y += 5;
  drawRow("Start Date:", v(data.start_date));
  drawRow("End Date:", v(data.end_date));
  drawRow("Doctor:", v(data.doctor_name));
  drawRow("Facility:", v(data.facility));
  drawRow("Diagnosis:", v(data.diagnosis));

  y += 2;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("C. Reason / Medical Justification", margin, y); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const reasonLines = doc.splitTextToSize(blank ? " ".repeat(0) : (data.reason || "—"), pageW - margin * 2);
  doc.text(reasonLines, margin, y);
  y += Math.max(reasonLines.length * 5, blank ? 22 : 8);
  if (blank) { for (let i = 0; i < 4; i++) { doc.line(margin, y, pageW - margin, y); y += 6; } }

  y += 2;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("D. Recommendation (Medical Officer / Supervisor)", margin, y); y += 5;
  if (blank) { for (let i = 0; i < 3; i++) { doc.line(margin, y, pageW - margin, y); y += 6; } }
  else {
    doc.setFont("helvetica", "normal").setFontSize(10);
    const recLines = doc.splitTextToSize(data.recommendation || "—", pageW - margin * 2);
    doc.text(recLines, margin, y); y += recLines.length * 5;
  }

  y += 2;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("E. Approval", margin, y); y += 5;
  drawRow("Status:", blank ? "" : (data.status || "PENDING").toUpperCase());
  drawRow("Reviewed By:", blank ? "" : `${data.reviewer_rank || ""} ${data.reviewer_name || "—"}`.trim());
  drawRow("Reviewed On:", blank ? "" : (data.reviewed_at ? format(new Date(data.reviewed_at), "dd MMM yyyy HH:mm") : "—"));

  y += 4;
  // Signature block
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("F. Authorised Signature", margin, y); y += 8;
  doc.setLineWidth(0.3);
  // Two signature columns
  const colW = (pageW - margin * 2 - 10) / 2;
  // Officer
  doc.line(margin, y, margin + colW, y);
  doc.line(pageW - margin - colW, y, pageW - margin, y);
  y += 4;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Officer's Signature & Date", margin, y);
  doc.text(`Authorising Officer: ${blank ? "" : (data.authorised_rank || "") + " " + (data.authorised_by || "—")}`.trim(), pageW - margin - colW, y);
  y += 12;

  // Footer
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(120);
  doc.text(
    `Ghana Immigration Service · Cybernet HRM · ${blank ? "Blank standard form" : "Generated " + format(new Date(), "dd MMM yyyy HH:mm")}`,
    pageW / 2, 287, { align: "center" }
  );
  doc.setTextColor(0);

  const fname = blank
    ? "GIS_Excuse_Duty_Form_BLANK.pdf"
    : `GIS_Excuse_Duty_${(data.staff_id || "form").replace(/[^a-z0-9]/gi, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`;
  doc.save(fname);
}

// ─────────────────────────── DOCX ───────────────────────────
const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function kv(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA }, borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 6360, type: WidthType.DXA }, borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(value || "")] })],
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24 })],
  });
}

export async function downloadExcuseDutyDOCX(data: ExcuseDutyData, blank = false) {
  const v = (x?: string) => (blank ? "" : (x && x.trim() ? x : "—"));

  const docx = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ORG_TITLE, bold: true, size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ORG_SUB, size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: FORM_TITLE, bold: true, size: 26 })] }),

        sectionHeading("A. Officer Details"),
        new Table({
          width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
          rows: [
            kv("Staff Name", v(data.staff_name)),
            kv("Rank", v(data.rank)),
            kv("Staff ID", v(data.staff_id)),
            kv("Directorate / Unit", v(data.directorate)),
            kv("Office", v(data.office)),
            kv("Shift Group", v(data.shift_group)),
            kv("Contact", blank ? "" : `${data.phone || "—"}${data.email ? " · " + data.email : ""}`),
          ],
        }),

        sectionHeading("B. Excuse Duty Period"),
        new Table({
          width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
          rows: [
            kv("Start Date", v(data.start_date)),
            kv("End Date", v(data.end_date)),
            kv("Doctor", v(data.doctor_name)),
            kv("Facility", v(data.facility)),
            kv("Diagnosis", v(data.diagnosis)),
          ],
        }),

        sectionHeading("C. Reason / Medical Justification"),
        new Paragraph({ children: [new TextRun(blank ? "____________________________________________________________________________________________________________________________________________________________________________________________________" : (data.reason || "—"))] }),

        sectionHeading("D. Recommendation (Medical Officer / Supervisor)"),
        new Paragraph({ children: [new TextRun(blank ? "____________________________________________________________________________________________________________________________________________________________" : (data.recommendation || "—"))] }),

        sectionHeading("E. Approval"),
        new Table({
          width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
          rows: [
            kv("Status", blank ? "" : (data.status || "PENDING").toUpperCase()),
            kv("Reviewed By", blank ? "" : `${data.reviewer_rank || ""} ${data.reviewer_name || "—"}`.trim()),
            kv("Reviewed On", blank ? "" : (data.reviewed_at ? format(new Date(data.reviewed_at), "dd MMM yyyy HH:mm") : "—")),
          ],
        }),

        sectionHeading("F. Authorised Signature"),
        new Paragraph({ spacing: { before: 240 }, children: [new TextRun("Officer's Signature: ____________________________     Date: ______________")] }),
        new Paragraph({ spacing: { before: 240 }, children: [new TextRun(`Authorising Officer: ${blank ? "____________________________" : (data.authorised_rank || "") + " " + (data.authorised_by || "—")}`)] }),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun("Signature: ____________________________     Date: ______________")] }),

        new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Ghana Immigration Service · Cybernet HRM · ${blank ? "Blank standard form" : "Generated " + format(new Date(), "dd MMM yyyy HH:mm")}`, italics: true, size: 16, color: "777777" })] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(docx);
  const fname = blank
    ? "GIS_Excuse_Duty_Form_BLANK.docx"
    : `GIS_Excuse_Duty_${(data.staff_id || "form").replace(/[^a-z0-9]/gi, "_")}_${format(new Date(), "yyyyMMdd")}.docx`;
  saveAs(blob, fname);
}
