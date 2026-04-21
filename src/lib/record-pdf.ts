import jsPDF from "jspdf";
import { format } from "date-fns";

/**
 * Lightweight, dependency-free PDF generator for Front Desk / Processing
 * application records. Produces a branded one-page document that works
 * consistently for Visa, Extension, Passport, Official and Enquiry records.
 */

export type RecordKind =
  | "visa_application"
  | "visa_extension"
  | "passport_application"
  | "official_application"
  | "enquiry_application";

const TITLES: Record<RecordKind, string> = {
  visa_application: "Visa Application",
  visa_extension: "Visa Extension Request",
  passport_application: "Passport Application",
  official_application: "Official Application",
  enquiry_application: "Enquiry Application",
};

/** Human-friendly key → label map. */
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
  updated_at: "Last Updated",
};

const FIELDS_BY_KIND: Record<RecordKind, string[]> = {
  visa_application: [
    "applicant_name", "passport_number", "nationality", "visa_type",
    "date_of_birth", "gender", "marital_status", "phone",
    "home_address", "foreign_address", "street_name", "nearest_landmark",
    "next_of_kin", "emergency_contact", "entry_date", "exit_date",
    "purpose", "status", "notes", "created_at",
  ],
  visa_extension: [
    "applicant_name", "passport_number", "nationality", "permit_type",
    "fee_charged", "current_visa_expiry", "requested_extension_date",
    "date_of_birth", "gender", "marital_status", "phone",
    "home_address", "foreign_address", "street_name", "nearest_landmark",
    "next_of_kin", "emergency_contact", "reason", "status", "notes", "created_at",
  ],
  passport_application: [
    "applicant_name", "date_of_birth", "nationality", "application_type",
    "gender", "marital_status", "phone", "address", "foreign_address",
    "street_name", "nearest_landmark", "next_of_kin", "emergency_contact",
    "status", "notes", "created_at",
  ],
  official_application: [
    "applicant_name", "passport_number", "nationality", "official_type",
    "reference_number", "requesting_entity", "purpose",
    "date_of_birth", "gender", "marital_status", "phone",
    "home_address", "foreign_address", "street_name", "nearest_landmark",
    "next_of_kin", "emergency_contact", "status", "notes", "created_at",
  ],
  enquiry_application: [
    "applicant_name", "passport_number", "nationality", "enquiry_type",
    "subject", "purpose", "response",
    "date_of_birth", "gender", "marital_status", "phone",
    "home_address", "foreign_address", "street_name", "nearest_landmark",
    "next_of_kin", "emergency_contact", "status", "notes", "created_at",
  ],
};

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "fee_charged") return `GHS ${Number(value).toFixed(2)}`;
  if (key === "created_at" || key === "updated_at") {
    try { return format(new Date(value), "dd MMM yyyy, HH:mm"); } catch { return String(value); }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try { return format(new Date(value), "dd MMM yyyy"); } catch { return String(value); }
  }
  if (typeof value === "string") return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return String(value);
}

export function buildRecordPdf(kind: RecordKind, record: Record<string, any>): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 78, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Ghana Immigration Service", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Amasaman Sector Command", margin, 48);
  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pageWidth - margin, 32, { align: "right" });

  y = 110;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(TITLES[kind], margin, y);
  y += 8;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Record ID + status chip
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (record.id) doc.text(`Record ID: ${record.id}`, margin, y);
  y += 18;

  // Body fields: two columns
  const fields = FIELDS_BY_KIND[kind];
  const colWidth = (pageWidth - margin * 2) / 2;
  doc.setFontSize(10);

  let col = 0;
  let rowY = y;
  for (const key of fields) {
    if (!(key in record)) continue;
    const value = record[key];
    const label = LABELS[key] ?? key;
    const x = margin + col * colWidth;

    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.text(label, x, rowY);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    const valueStr = formatValue(key, value);
    const lines = doc.splitTextToSize(valueStr, colWidth - 12);
    doc.text(lines as string[], x, rowY + 12);

    const rowHeight = 16 + Math.max(0, (lines.length - 1) * 12);
    if (col === 0) {
      col = 1;
    } else {
      col = 0;
      rowY += rowHeight + 10;
    }

    if (rowY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      rowY = margin;
    }
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 30;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Ghana Immigration Service — Cybernet HRM", margin, footerY);
  doc.text("Official internal document", pageWidth - margin, footerY, { align: "right" });

  return doc;
}

export function downloadRecordPdf(kind: RecordKind, record: Record<string, any>): void {
  const doc = buildRecordPdf(kind, record);
  const safeName = String(record.applicant_name || record.id || "record")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  doc.save(`${kind}_${safeName}.pdf`);
}

export function printRecordPdf(kind: RecordKind, record: Record<string, any>): void {
  const doc = buildRecordPdf(kind, record);
  // Open in a new window and trigger print
  const blobUrl = doc.output("bloburl");
  const w = window.open(blobUrl as unknown as string, "_blank");
  if (w) {
    w.addEventListener("load", () => {
      try { w.focus(); w.print(); } catch {}
    });
  }
}

export function recordPdfBase64(kind: RecordKind, record: Record<string, any>): string {
  const doc = buildRecordPdf(kind, record);
  const out = doc.output("datauristring"); // data:application/pdf;base64,....
  const idx = out.indexOf("base64,");
  return idx >= 0 ? out.slice(idx + 7) : out;
}

export { TITLES as RECORD_TITLES };
