/**
 * Shared option lists for the Holding / Detention Center module.
 * Single source of truth so the intake form, edit dialog, bail form,
 * reports and printed records all use identical values.
 */

/** Sentinel option that reveals a free-text "specify" field. */
export const OTHER_AGENCY = "Other Agency or Command";
export const OTHER_RELATIONSHIP = "Other";

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export const genderLabel = (v?: string | null) =>
  GENDER_OPTIONS.find((g) => g.value === (v ?? "").toLowerCase())?.label ?? (v || "—");

export const REFERRAL_SOURCES = [
  "Ghana Police Service",
  "Ghana Immigration Service HQ",
  "Regional Command",
  "Sector Command",
  "Border Patrol Unit",
  "Enforcement Unit",
  "Airport (KIA)",
  "Public / Walk-in Report",
  "National Security",
  OTHER_AGENCY,
];

export const REFERRAL_DESTINATIONS = [
  "Ghana Police Service",
  "Ghana Immigration Service HQ",
  "Regional Command",
  "Sector Command",
  "Repatriation Unit",
  "Court",
  "Hospital / Clinic",
  "Prisons Service",
  "Embassy / Consulate",
  OTHER_AGENCY,
];

/** Relationship to bailee — comprehensive list, "Other" reveals a specify field. */
export const RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Husband",
  "Wife",
  "Father",
  "Mother",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Parent",
  "Child",
  "Grandparent",
  "Grandchild",
  "Uncle",
  "Aunt",
  "Nephew",
  "Niece",
  "Cousin",
  "Guardian",
  "Legal Representative",
  "Employer",
  "Employee",
  "Friend",
  "Colleague",
  "Lawyer",
  "Sponsor",
  OTHER_RELATIONSHIP,
];

/** Human-readable referral value: falls back to the specified agency/command. */
export const referralDisplay = (value?: string | null, other?: string | null) =>
  value === OTHER_AGENCY ? (other ? `${OTHER_AGENCY} — ${other}` : OTHER_AGENCY) : value || null;

/** Human-readable relationship value: falls back to the specified relationship. */
export const relationshipDisplay = (value?: string | null, other?: string | null) =>
  value === OTHER_RELATIONSHIP ? (other ? `Other — ${other}` : "Other") : value || null;

/* --------------------------- Type of Offense ---------------------------- */
/**
 * Internationally recognised immigration-related offense taxonomy, grouped for
 * the dropdown. Stored as free text in `detention_records.crime_type`, so
 * legacy values keep rendering exactly as recorded.
 */
export const OTHER_OFFENSE = "Other (specify)";

export const OFFENSE_GROUPS: { group: string; options: string[] }[] = [
  {
    group: "Immigration Offenses",
    options: [
      "Illegal Entry",
      "Illegal Exit",
      "Overstay",
      "Unlawful Residence",
      "Breach of Visa/Permit Conditions",
      "Unlawful Employment",
      "Failure to Register",
      "Evading Immigration Control",
      "Re-entry After Removal",
    ],
  },
  {
    group: "Document Offenses",
    options: [
      "Document Fraud",
      "Forged/Altered Travel Document",
      "Impersonation",
      "False Statement/Misrepresentation",
      "Possession of Another Person's Document",
    ],
  },
  {
    group: "Smuggling & Trafficking",
    options: ["Migrant Smuggling", "Human Trafficking", "Child Trafficking", "Facilitating Illegal Entry"],
  },
  {
    group: "Cyber & Financial",
    options: [
      "Cyber Fraud / Internet Fraud",
      "Identity Theft",
      "Money Laundering",
      "Online Romance Scam",
      "Financial Fraud",
    ],
  },
  {
    group: "Other Criminal Offenses",
    options: [
      "Assault",
      "Theft",
      "Drug Offence",
      "Firearms Offence",
      "Public Order Offence",
      "Obstruction of an Officer",
      "Absconding from Custody",
    ],
  },
  { group: "Other", options: [OTHER_OFFENSE] },
];

/** Flat list of every offense value. */
export const OFFENSE_TYPES = OFFENSE_GROUPS.flatMap((g) => g.options);

/** Category a stored offense value belongs to (for analytics summaries). */
export function offenseCategory(value?: string | null): string {
  if (!value) return "Unclassified";
  const hit = OFFENSE_GROUPS.find((g) => g.options.includes(value));
  return hit ? hit.group : "Other / Legacy";
}
