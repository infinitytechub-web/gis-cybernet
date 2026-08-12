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
