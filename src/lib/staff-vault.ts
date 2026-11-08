export const STAFF_VAULT_CATEGORIES = [
  { value: "certificate", label: "Certificate" }, { value: "identity", label: "Identity" }, { value: "appointment", label: "Appointment letter" },
  { value: "training", label: "Training" }, { value: "commendation", label: "Commendation" }, { value: "medical", label: "Medical" }, { value: "other", label: "Other" },
];
export const staffVaultCategoryLabel = (v: string) => STAFF_VAULT_CATEGORIES.find(c => c.value === v)?.label ?? v;
export const STAFF_VAULT_MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"];
/** Returns an error message, or null when the file may be stored. */
export function validateStaffVaultFile(f: { name: string; size: number }): string | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.includes(ext)) return "Only PDF, Word, Excel, JPG or PNG files are allowed";
  if (f.size <= 0) return "The file is empty";
  if (f.size > STAFF_VAULT_MAX_BYTES) return "Files must be 20 MB or smaller";
  return null;
}
