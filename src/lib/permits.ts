export const PERMIT_TYPES = [
  { value: "work_permit", label: "Work Permit" },
  { value: "residence_permit", label: "Residence Permit" },
  { value: "student_permit", label: "Student Permit" },
  { value: "visitors_permit", label: "Visitor's Permit" },
  { value: "dependants_permit", label: "Dependant's Permit" },
  { value: "emergency_entry_permit", label: "Emergency Entry Permit" },
  { value: "re_entry_permit", label: "Re-Entry Permit" },
  { value: "indefinite_residence", label: "Indefinite Residence Permit" },
  { value: "right_of_abode", label: "Right of Abode" },
  { value: "other", label: "Other" },
] as const;

export const PERMIT_STATUSES = ["submitted", "under_review", "approved", "rejected", "collected"];
export const PROCESSING_PERMIT_STATUSES = ["submitted", "under_review"];

export function permitTypeLabel(v?: string | null) {
  if (!v) return "—";
  return PERMIT_TYPES.find((p) => p.value === v)?.label ?? v.replace(/_/g, " ");
}
