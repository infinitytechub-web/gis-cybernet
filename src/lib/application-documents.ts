// src/lib/application-documents.ts
// Required-document slot definitions for each GIS application type.

export type RecordType = "permit" | "visa" | "visa_extension" | "passport";

export interface DocSlot {
  /** Stable machine key. */
  key: string;
  /** Human label shown in UI / GIS forms. */
  label: string;
  /** Marked as mandatory at submission time. */
  required: boolean;
}

const COMMON_VISA: DocSlot[] = [
  { key: "passport_bio", label: "Passport bio data page", required: true },
  { key: "passport_photo", label: "Recent passport-size photograph", required: true },
  { key: "yellow_fever", label: "Yellow Fever vaccination certificate", required: true },
  { key: "host_invitation", label: "Invitation / host letter", required: false },
  { key: "ticket_itinerary", label: "Return ticket / itinerary", required: false },
  { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
];

const COMMON_PASSPORT: DocSlot[] = [
  { key: "ghana_card", label: "Ghana Card (front & back)", required: true },
  { key: "birth_cert", label: "Birth certificate", required: true },
  { key: "passport_photo", label: "Two recent passport photographs", required: true },
  { key: "guarantor_form", label: "Guarantor form (signed)", required: true },
  { key: "signed_declaration", label: "Signed Declaration (MFA Form A)", required: true },
  { key: "old_passport", label: "Previous passport (renewal/replacement)", required: false },
  { key: "police_report", label: "Police report (replacement only)", required: false },
  { key: "fee_receipt", label: "Application fee receipt", required: true },
];

const SLOTS_BY_PERMIT: Record<string, DocSlot[]> = {
  work_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "employment_letter", label: "Letter of employment / appointment", required: true },
    { key: "business_reg", label: "Business registration / certificate of incorporation", required: true },
    { key: "tax_clearance", label: "GRA tax clearance certificate", required: true },
    { key: "ssnit_clearance", label: "SSNIT clearance", required: true },
    { key: "labour_quota", label: "Approved immigrant quota / labour certificate", required: true },
    { key: "qualifications", label: "Academic / professional qualifications", required: true },
    { key: "medical_cert", label: "Medical fitness certificate", required: true },
    { key: "police_clearance", label: "Police clearance (country of origin)", required: true },
    { key: "cv", label: "Curriculum vitae", required: false },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  residence_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "proof_of_means", label: "Proof of means of support", required: true },
    { key: "host_letter", label: "Host / sponsor letter & ID", required: true },
    { key: "tenancy", label: "Tenancy agreement / proof of address", required: true },
    { key: "medical_cert", label: "Medical fitness certificate", required: true },
    { key: "police_clearance", label: "Police clearance (country of origin)", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  student_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "admission_letter", label: "Admission / acceptance letter", required: true },
    { key: "school_accreditation", label: "School accreditation / NAB certificate", required: true },
    { key: "fee_receipt_school", label: "Tuition fee payment receipt", required: true },
    { key: "proof_of_means", label: "Proof of financial support", required: true },
    { key: "medical_cert", label: "Medical fitness certificate", required: true },
    { key: "police_clearance", label: "Police clearance", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  visitors_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "host_letter", label: "Host invitation letter", required: true },
    { key: "host_id", label: "Host ID (Ghana Card / passport)", required: true },
    { key: "return_ticket", label: "Return ticket", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  dependants_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "principal_permit", label: "Principal's residence/work permit", required: true },
    { key: "relationship_proof", label: "Marriage / birth certificate (relationship proof)", required: true },
    { key: "principal_letter", label: "Sponsorship letter from principal", required: true },
    { key: "medical_cert", label: "Medical fitness certificate", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  emergency_entry_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "justification_letter", label: "Justification / emergency letter", required: true },
    { key: "host_letter", label: "Host or guarantor letter", required: false },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  re_entry_permit: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "current_permit", label: "Current Ghana residence/work permit", required: true },
    { key: "travel_justification", label: "Travel justification letter", required: false },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  indefinite_residence: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "residence_history", label: "Proof of continuous residence (≥7 yrs)", required: true },
    { key: "tax_records", label: "Tax records / GRA clearance", required: true },
    { key: "good_character", label: "Police clearance / good character certificate", required: true },
    { key: "income_proof", label: "Proof of stable income", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  right_of_abode: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "ancestry_proof", label: "Proof of Ghanaian ancestry / dual nationality", required: true },
    { key: "police_clearance", label: "Police clearance", required: true },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
  other: [
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "supporting_letter", label: "Supporting letter", required: false },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ],
};

export function getPermitSlots(permitType?: string | null): DocSlot[] {
  if (!permitType) return SLOTS_BY_PERMIT.other;
  return SLOTS_BY_PERMIT[permitType] ?? SLOTS_BY_PERMIT.other;
}

export function getVisaSlots(): DocSlot[] { return COMMON_VISA; }
export function getVisaExtensionSlots(): DocSlot[] {
  return [
    { key: "current_visa_page", label: "Current visa / permit page", required: true },
    { key: "passport_bio", label: "Passport bio data page", required: true },
    { key: "passport_photo", label: "Recent passport photograph", required: true },
    { key: "extension_letter", label: "Reason / justification letter", required: true },
    { key: "host_letter", label: "Host or sponsor letter", required: false },
    { key: "fee_receipt", label: "GIS fee payment receipt", required: true },
  ];
}
export function getPassportSlots(): DocSlot[] { return COMMON_PASSPORT; }

export function getSlots(record: RecordType, permitType?: string | null): DocSlot[] {
  switch (record) {
    case "permit": return getPermitSlots(permitType);
    case "visa": return getVisaSlots();
    case "visa_extension": return getVisaExtensionSlots();
    case "passport": return getPassportSlots();
  }
}

/** Required field labels (UI hints) per record type — not enforced by DB. */
export const REQUIRED_FIELDS: Record<RecordType, string[]> = {
  permit: ["surname", "other_names", "passport_number", "passport_expiry_date", "nationality", "permit_type", "purpose"],
  visa: ["surname", "other_names", "passport_number", "passport_expiry_date", "nationality", "visa_type", "purpose"],
  visa_extension: ["applicant_name", "passport_number", "current_visa_expiry", "requested_extension_date", "reason"],
  passport: ["surname", "other_names", "date_of_birth", "place_of_birth", "ghana_card_number", "application_type"],
};
