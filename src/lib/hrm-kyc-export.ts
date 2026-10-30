/** KYC staff profile export: field catalogue, masking and row building (pure, testable). */
import { formatDate } from "@/lib/date-format";

export type KycField = { key: string; label: string; group: string; restricted?: boolean; date?: boolean };

export const KYC_FIELDS: KycField[] = [
  { key: "staff_id", label: "Staff ID", group: "Identity" },
  { key: "last_name", label: "Last name", group: "Identity" },
  { key: "first_name", label: "First name", group: "Identity" },
  { key: "other_names", label: "Other names", group: "Identity" },
  { key: "gender", label: "Sex", group: "Identity" },
  { key: "date_of_birth", label: "Date of birth", group: "Identity", restricted: true, date: true },
  { key: "marital_status", label: "Marital status", group: "Identity" },
  { key: "hometown", label: "Hometown", group: "Identity" },
  { key: "region_of_origin", label: "Region of origin", group: "Identity" },
  { key: "phone", label: "Phone", group: "Contact", restricted: true },
  { key: "email", label: "Email", group: "Contact" },
  { key: "residential_address", label: "Residential address", group: "Contact", restricted: true },
  { key: "digital_address", label: "Digital address", group: "Contact", restricted: true },
  { key: "ghana_card_number", label: "Ghana Card number", group: "KYC", restricted: true },
  { key: "blood_group", label: "Blood group", group: "KYC" },
  { key: "height_cm", label: "Height (cm)", group: "KYC" },
  { key: "rank", label: "Rank", group: "Service" },
  { key: "department", label: "Department", group: "Service" },
  { key: "command", label: "Command / Unit", group: "Service" },
  { key: "intake", label: "Intake", group: "Service" },
  { key: "staff_category", label: "Category", group: "Service" },
  { key: "current_appointment", label: "Current appointment", group: "Service" },
  { key: "date_joined_service", label: "Date joined service", group: "Service", date: true },
  { key: "status", label: "Status", group: "Service" },
  { key: "appointments", label: "Appointments", group: "Service record" },
  { key: "promotions", label: "Promotions", group: "Service record" },
  { key: "exits", label: "Exits", group: "Service record" },
];

export const KYC_GROUPS = Array.from(new Set(KYC_FIELDS.map((f) => f.group)));

/** Mask a restricted value, keeping the last two characters. */
export function maskValue(v: string): string {
  if (!v) return v;
  return v.length <= 2 ? "••" : `${"•".repeat(Math.min(6, v.length - 2))}${v.slice(-2)}`;
}

export function buildKycRows(
  profiles: Record<string, any>[],
  keys: string[],
  canSeeRestricted: boolean | ((p: Record<string, any>) => boolean),
): { headers: string[]; rows: string[][] } {
  const fields = KYC_FIELDS.filter((f) => keys.includes(f.key));
  const rows = profiles.map((p) => {
    const full = typeof canSeeRestricted === "function" ? canSeeRestricted(p) : canSeeRestricted;
    return fields.map((f) => {
      const raw = p[f.key];
      let s = raw == null ? "" : Array.isArray(raw) ? raw.join("; ") : String(raw);
      if (s && f.date) s = formatDate(s);
      if (s && f.restricted && !full) s = maskValue(s);
      return s;
    });
  });
  return { headers: fields.map((f) => f.label), rows };
}

/** Safe file/folder name for archive entries. */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
}
