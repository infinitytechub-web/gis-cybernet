/**
 * PERSONNEL BIO-DATA & SERVICE RECORD — shared data builder (sections A–L).
 *
 * One fetch, one assembled structure, reused by every download format (PDF,
 * Word, Excel, CSV) so all copies contain exactly the same information.
 *
 * Restricted sections (medical & welfare, bank / salary) are only included when
 * the database allows the caller to read them — an unauthorised user simply gets
 * a "restricted" note in their copy. Every included restricted section is
 * recorded in the access log, whatever format was chosen.
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const dmy = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : format(d, "dd/MM/yyyy");
};

export const txt = (v: unknown) => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "—";
  return String(v);
};

export type Pair = [string, unknown];

export type BioDataSection =
  | { kind: "pairs"; letter: string; title: string; note?: string; pairs: Pair[] }
  | { kind: "table"; letter: string; title: string; note?: string; head: string[]; rows: string[][] };

export interface BioDataRecord {
  fullName: string;
  staffId: string;
  sections: BioDataSection[];
}

/** Fetches one personnel record and assembles sections A–L for any format. */
export async function buildBioDataRecord(profileId: string): Promise<BioDataRecord> {
  const [
    profileRes, eduRes, empRes, famRes, emgRes, bankRes, medRes, verRes, postRes,
    cvRes, crRes, fieldsRes, tablesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*, ranks(name, abbreviation), departments(name)").eq("id", profileId).maybeSingle(),
    supabase.from("staff_education").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_employment_history").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_family_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_emergency_contacts").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_bank_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_medical_welfare").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_biodata_verifications").select("*").eq("profile_id", profileId),
    supabase
      .from("postings_transfers")
      .select("type, status, effective_date, from_department:from_department_id(name), to_department:to_department_id(name)")
      .eq("profile_id", profileId)
      .order("effective_date", { ascending: false }),
    supabase.from("biodata_custom_values").select("field_id, value").eq("profile_id", profileId),
    supabase.from("biodata_custom_rows").select("table_id, values, sort_order").eq("profile_id", profileId).order("sort_order"),
    supabase.from("biodata_custom_fields").select("id, section, label").eq("active", true),
    supabase.from("biodata_custom_tables").select("id, section, label").eq("active", true),
  ]);

  const p: any = profileRes.data;
  if (!p) throw new Error("That record could not be read");

  const fullName = [p.last_name, p.first_name, p.other_names].filter(Boolean).join(" ");

  const customFields = (fieldsRes.data ?? []) as any[];
  const customValues = new Map(((cvRes.data ?? []) as any[]).map((r) => [r.field_id, r.value]));
  const customTables = (tablesRes.data ?? []) as any[];
  const customRows = (crRes.data ?? []) as any[];

  const extrasFor = (section: string): Pair[] =>
    customFields
      .filter((f) => f.section === section)
      .map((f) => [f.label, customValues.get(f.id) ?? ""] as Pair);

  const sections: BioDataSection[] = [];

  const pairs = (letter: string, title: string, list: Pair[], note?: string) => {
    sections.push({ kind: "pairs", letter, title, note, pairs: list });
  };
  const table = (letter: string, title: string, head: string[], rows: string[][], note?: string) => {
    sections.push({ kind: "table", letter, title, note, head, rows });
  };
  const extraTablesFor = (section: string) => {
    for (const t of customTables.filter((x) => x.section === section)) {
      const rows = customRows.filter((r) => r.table_id === t.id);
      if (!rows.length) continue;
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r.values ?? {})))];
      table(section, t.label, keys, rows.map((r) => keys.map((k) => txt((r.values ?? {})[k]))));
    }
  };

  // A
  pairs("A", "Form administration", [
    ["Date of completion", dmy(p.form_completed_on)],
    ["Service / organization", p.service_organization],
    ["Sector / command", p.sector_command],
    ["Station / unit", p.station_unit],
    ["Staff ID", p.staff_id],
    ["IS / No.", p.is_number],
    ["Department", p.departments?.name],
    ["Unit", p.unit],
    ["Office", p.office],
    ["Status", p.status],
    ...extrasFor("A"),
  ]);
  extraTablesFor("A");

  // B
  pairs("B", "Personal identification data", [
    ["Surname", p.last_name],
    ["First name", p.first_name],
    ["Other name(s)", p.other_names],
    ["Sex", p.gender],
    ["Date of birth", dmy(p.date_of_birth)],
    ["Place of birth", p.place_of_birth],
    ["Hometown", p.hometown],
    ["Region of origin", p.region_of_origin],
    ["Ghana Card no.", p.ghana_card_number],
    ["Rank", p.ranks?.name],
    ["Date of appointment", dmy(p.date_of_appointment)],
    ["Cadet intake", p.cadet_intake],
    ["Recruit intake", p.recruit_intake],
    ["Date joined service", dmy(p.date_joined_service)],
    ...extrasFor("B"),
  ]);
  extraTablesFor("B");

  // C
  pairs("C", "Residential & contact information", [
    ["Current place of stay", p.current_place_of_stay],
    ["Residential address", p.residential_address],
    ["Digital address", p.digital_address],
    ["Postal address", p.postal_address],
    ["Residential telephone", p.residential_phone],
    ["Mobile no. 1", p.phone],
    ["Email address", p.email],
    ...extrasFor("C"),
  ]);
  extraTablesFor("C");

  // D
  pairs("D", "Physical & personal profile", [
    ["Height (cm)", p.height_cm],
    ["Blood group", p.blood_group],
    ["Uniform size", p.uniform_size],
    ["Shoe size", p.shoe_size],
    ["Religion", p.religion],
    ["Hobbies / interests", p.hobbies],
    ["Special skill(s)", p.special_skills],
    ...extrasFor("D"),
  ]);
  extraTablesFor("D");

  // E — restricted
  const med = medRes.data as any;
  pairs("E", "Medical & welfare information", med
    ? [
        ["Medical condition(s) / allergy(ies)", med.medical_conditions],
        ["Additional medical / welfare notes", med.welfare_notes],
        ...extrasFor("E"),
      ]
    : [["Access", medRes.error
        ? "Restricted — not included in this copy"
        : "No medical or welfare details recorded"]],
    "restricted access");
  extraTablesFor("E");

  // F
  table("F", "Educational qualifications",
    ["Name & location of school / institution", "From", "To", "Qualification"],
    ((eduRes.data ?? []) as any[]).map((r) => [txt(r.institution), txt(r.from_date), txt(r.to_date), txt(r.qualification)]));
  extraTablesFor("F");

  // G
  table("G", "Previous employment / work experience",
    ["Organization / employer", "Position held", "From", "To", "Reason for leaving"],
    ((empRes.data ?? []) as any[]).map((r) => [txt(r.employer), txt(r.position_held), txt(r.from_date), txt(r.to_date), txt(r.reason_for_leaving)]));
  pairs("G", "Previous employment (summary)", [
    ["Last position held at previous place of work", p.previous_last_position],
    ["Reason for leaving previous place of work", p.previous_reason_for_leaving],
    ...extrasFor("G"),
  ]);
  extraTablesFor("G");

  // H
  const fam = (famRes.data ?? {}) as any;
  pairs("H", "Family & dependant information", [
    ["Marital status", p.marital_status],
    ["Number of children", p.number_of_children],
    ["Spouse — name", fam.spouse_name],
    ["Spouse — telephone", fam.spouse_phone],
    ["Spouse — residential address", fam.spouse_address],
    ["Next of kin — name", fam.nok_name],
    ["Next of kin — relationship", fam.nok_relationship],
    ["Next of kin — telephone", fam.nok_phone],
    ["Next of kin — address", fam.nok_address],
    ["Father — name / telephone", [fam.father_name, fam.father_phone].filter(Boolean).join(" · ")],
    ["Mother — name / telephone", [fam.mother_name, fam.mother_phone].filter(Boolean).join(" · ")],
    ...extrasFor("H"),
  ]);
  table("H", "Emergency contacts",
    ["Name", "Relationship", "Telephone", "Address"],
    ((emgRes.data ?? []) as any[]).map((r) => [txt(r.name), txt(r.relationship), txt(r.phone), txt(r.address)]));
  extraTablesFor("H");

  // I — restricted
  const bank = bankRes.data as any;
  pairs("I", "Bank / salary information", bank
    ? [
        ["Bank name", bank.bank_name],
        ["Branch", bank.branch],
        ["Account number", bank.account_number],
        ...extrasFor("I"),
      ]
    : [["Access", bankRes.error
        ? "Restricted — not included in this copy"
        : "No bank / salary details recorded"]],
    "restricted access");
  extraTablesFor("I");

  // J
  table("J", "Service / transfer history",
    ["From station / command", "To station / command", "Type", "Effective date", "Status"],
    ((postRes.data ?? []) as any[]).map((r) => [
      txt(r.from_department?.name), txt(r.to_department?.name), txt(r.type), dmy(r.effective_date), txt(r.status),
    ]));
  extraTablesFor("J");

  // K & L
  const vers = new Map(((verRes.data ?? []) as any[]).map((r) => [r.kind, r]));
  const decl: any = vers.get("declaration") ?? {};
  pairs("K", "Official verification — declaration by staff member", [
    ["Declaration", "I certify that the information provided in this form is true, complete and accurate to the best of my knowledge."],
    ["Staff name", decl.name || fullName],
    ["Staff ID / IS No.", decl.rank_position || [p.staff_id, p.is_number].filter(Boolean).join(" / ")],
    ["Signature", decl.signature],
    ["Date", dmy(decl.signed_on)],
    ...extrasFor("K"),
  ]);
  table("L", "Command / HR verification",
    ["Stage", "Name", "Rank / position", "Signature", "Date"],
    (["checked", "verified", "approved"] as const).map((kind) => {
      const v: any = vers.get(kind) ?? {};
      return [kind.replace(/^./, (c) => c.toUpperCase()) + " by", txt(v.name), txt(v.rank_position), txt(v.signature), dmy(v.signed_on)];
    }));
  extraTablesFor("L");

  return { fullName, staffId: txt(p.staff_id), sections, ...( { restricted: { med: !!med, bank: !!bank } } as any) };
}

/**
 * Logs every restricted section that made it into a downloaded copy.
 * `formatTag` names the chosen format so the audit trail shows what left.
 */
export function logBioDataRestrictedSections(
  profileId: string,
  record: BioDataRecord,
  formatTag: string,
) {
  const flags = (record as any).restricted as { med: boolean; bank: boolean } | undefined;
  if (!flags) return;
  const sections = [flags.med ? "medical" : null, flags.bank ? "bank" : null].filter(Boolean) as string[];
  for (const section of sections) {
    void supabase.rpc("log_biodata_restricted_access", {
      _profile_id: profileId,
      _section: section,
      _action: "view",
      _changed_fields: [`${formatTag}_export`],
      _user_agent: navigator.userAgent,
    });
  }
}

/** Safe, dated base filename for any format. */
export function bioDataFileBase(record: BioDataRecord) {
  const safe = (record.fullName || "bio-data").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `bio-data-${safe}-${format(new Date(), "yyyyMMdd")}`;
}
