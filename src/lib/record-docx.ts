import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import { format } from "date-fns";
import type { RecordKind } from "@/lib/record-pdf";
import { RECORD_TITLES } from "@/lib/record-pdf";

const LABELS: Record<string, string> = {
  applicant_name: "Applicant Name",
  passport_number: "Passport Number",
  nationality: "Nationality",
  visa_type: "Visa Type",
  permit_type: "Permit Type",
  application_type: "Application Type",
  official_type: "Official Type",
  enquiry_type: "Enquiry Type",
  status: "Status",
  purpose: "Purpose",
  reason: "Reason",
  subject: "Subject",
  response: "Response",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  marital_status: "Marital Status",
  phone: "Phone",
  home_address: "Home Address",
  address: "Address",
  foreign_address: "Foreign Address",
  street_name: "Street",
  nearest_landmark: "Nearest Landmark",
  next_of_kin: "Next of Kin",
  emergency_contact: "Emergency Contact",
  entry_date: "Entry Date",
  exit_date: "Exit Date",
  current_visa_expiry: "Current Visa Expiry",
  requested_extension_date: "Requested Extension Date",
  fee_charged: "Fee Charged (GHS)",
  reference_number: "Reference Number",
  requesting_entity: "Requesting Entity",
  notes: "Notes",
  created_at: "Submitted At",
};

const FIELDS_BY_KIND: Record<RecordKind, string[]> = {
  visa_application: ["applicant_name","passport_number","nationality","visa_type","date_of_birth","gender","marital_status","phone","home_address","foreign_address","next_of_kin","emergency_contact","entry_date","exit_date","purpose","status","notes","created_at"],
  visa_extension: ["applicant_name","passport_number","nationality","permit_type","fee_charged","current_visa_expiry","requested_extension_date","phone","reason","status","notes","created_at"],
  permit: ["application_reference","applicant_name","passport_number","nationality","permit_type","permit_category","occupation","employer_sponsor_name","institution_name","course_of_study","intended_duration_months","current_permit_expiry","requested_start_date","fee_charged","phone","purpose","status","notes","created_at"],
  passport_application: ["applicant_name","date_of_birth","nationality","application_type","gender","marital_status","phone","address","next_of_kin","emergency_contact","status","notes","created_at"],
  official_application: ["applicant_name","passport_number","nationality","official_type","reference_number","requesting_entity","purpose","phone","status","notes","created_at"],
  enquiry_application: ["applicant_name","passport_number","nationality","enquiry_type","subject","purpose","response","phone","status","notes","created_at"],
};

function fmt(key: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "fee_charged") return `GHS ${Number(v).toFixed(2)}`;
  if (key === "created_at") {
    try { return format(new Date(v), "dd MMM yyyy, HH:mm"); } catch { return String(v); }
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    try { return format(new Date(v), "dd MMM yyyy"); } catch { return String(v); }
  }
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function row(label: string, value: string, shaded = false): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        borders: cellBorders,
        shading: shaded ? { fill: "F1F5F9", type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 6360, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(value)] })],
      }),
    ],
  });
}

export async function buildRecordDocxBlob(
  kind: RecordKind,
  record: Record<string, any>,
): Promise<Blob> {
  const fields = FIELDS_BY_KIND[kind];
  const rows: TableRow[] = fields
    .filter((k) => k in record)
    .map((k, i) => row(LABELS[k] ?? k, fmt(k, record[k]), i % 2 === 0));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Ghana Immigration Service", bold: true, size: 28 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Cybernet HRM System", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, size: 18, color: "64748B" })],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: RECORD_TITLES[kind], bold: true, size: 28 })],
          }),
          ...(record.id ? [new Paragraph({ children: [new TextRun({ text: `Record ID: ${record.id}`, size: 18, color: "64748B" })] })] : []),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [3000, 6360],
            rows,
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Ghana Immigration Service — Cybernet HRM · Official internal document", size: 16, color: "64748B" })],
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadRecordDocx(
  kind: RecordKind,
  record: Record<string, any>,
): Promise<void> {
  const blob = await buildRecordDocxBlob(kind, record);
  const safeName = String(record.applicant_name || record.id || "record")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}_${safeName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
