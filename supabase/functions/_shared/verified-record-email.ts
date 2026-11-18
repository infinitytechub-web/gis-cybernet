import { jsPDF } from "npm:jspdf@3.0.4";
export const RECORD_TABLES: Record<string, string> = {
  visa_application: "visa_applications", visa_extension: "visa_extensions", permit: "permits",
  passport_application: "passport_applications", official_application: "official_applications", enquiry_application: "enquiry_applications",
};
const TITLES: Record<string, string> = {
  visa_application: "Visa Application",
  visa_extension: "Visa Extension Request",
  permit: "Permit Application",
  passport_application: "Passport Application",
  official_application: "Official Application",
  enquiry_application: "Enquiry Application",
}
const FIELDS: Record<string, string[]> = {
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
  permit: [
    "application_reference", "applicant_name", "passport_number", "nationality", "permit_type",
    "permit_category", "occupation", "employer_sponsor_name", "employer_sponsor_address",
    "institution_name", "course_of_study", "intended_duration_months",
    "current_permit_expiry", "requested_start_date", "fee_charged",
    "date_of_birth", "gender", "marital_status", "phone",
    "home_address", "foreign_address", "street_name", "nearest_landmark",
    "next_of_kin", "emergency_contact", "purpose", "status", "notes", "created_at",
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
}
export function buildVerifiedRecordEmail(kind: string, record: Record<string, unknown>) {
  if (!Object.hasOwn(RECORD_TABLES, kind)) throw new Error("Unsupported record");
  const title = TITLES[kind];
  const subject = `${title} — ${record.id}`;
  const message = `Please find attached the verified ${title.toLowerCase()} record.\n\nSent via Ghana Immigration Service — Cybernet.`;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Ghana Immigration Service", 40, 40);
  doc.setFontSize(12);
  doc.text(title, 40, 65);
  doc.setFontSize(9);
  doc.text(`Record ID: ${record.id}`, 40, 85);
  let y = 110;
  for (const key of FIELDS[kind]) {
    if (record[key] == null || record[key] === "") continue;
    const lines = doc.splitTextToSize(`${key.replace(/_/g, " ")}: ${String(record[key])}`, 510);
    for (const line of lines) {
      if (y > 780) { doc.addPage(); y = 40; }
      doc.text(line, 40, y); y += 13;
    }
    y += 6;
  }
  const bytes = doc.output("arraybuffer");
  const content = doc.output("datauristring").split("base64,")[1];
  return { subject, message, content, bytes, filename: `${kind}_${record.id}.pdf` };
}
