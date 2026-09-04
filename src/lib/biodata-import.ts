/**
 * ROSTER / BIO-DATA SPREADSHEET READER
 *
 * Reads an .xlsx / .xls / .csv roster and turns each row into a set of
 * pre-filled Bio-Data values. Nothing is written to the database here — the
 * values are handed to the Add/Edit form so the user can review and save.
 *
 * Column headers are matched loosely (case, spaces, punctuation and common
 * wordings are ignored), so most existing roster files work untouched.
 */
import * as XLSX from "xlsx";

export type BioDataPrefillRow = {
  /** Row number in the sheet (1 = first data row). */
  index: number;
  /** Text used for the searchable picker. */
  label: string;
  /** Values keyed by the form field name. */
  values: Record<string, string>;
  /** Repeating-row sections detected from the sheet. */
  education: Record<string, string>[];
  employment: Record<string, string>[];
  emergency: Record<string, string>[];
  /** Header names that were not recognised (shown to the user). */
  unmapped: string[];
};

/** Loose header key: lowercase letters and digits only. */
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Header aliases → form field name. First match wins, so put more specific
 * aliases before general ones.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  staffId: ["staffid", "staffno", "staffnumber", "servicenumber", "serviceno", "id", "idnumber"],
  isNumber: ["isno", "isnumber", "isnum"],
  lastName: ["surname", "lastname", "familyname"],
  firstName: ["firstname", "forename", "givenname", "firstnames"],
  otherNames: ["othernames", "othername", "middlename", "middlenames"],
  fullName: ["fullname", "name", "nameofofficer", "officername", "staffname"],
  gender: ["gender", "sex"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate"],
  placeOfBirth: ["placeofbirth", "pob"],
  hometown: ["hometown", "hometownvillage"],
  regionOfOrigin: ["regionoforigin", "region", "homeregion"],
  ghanaCardNumber: ["ghanacard", "ghanacardno", "ghanacardnumber", "nationalid", "ninumber"],
  rankName: ["rank", "ranktitle", "designation"],
  departmentName: ["department", "dept", "unitdepartment"],
  stationUnit: ["station", "stationunit", "postingstation", "dutystation"],
  sectorCommand: ["sector", "command", "sectorcommand"],
  serviceOrganization: ["service", "organization", "organisation", "serviceorganization"],
  unit: ["unit", "subunit", "office"],
  shiftGroup: ["shift", "shiftgroup", "platoon"],
  dateOfAppointment: ["dateofappointment", "appointmentdate", "dateappointed"],
  dateJoinedService: ["datejoined", "datejoinedservice", "enlistmentdate", "dateofenlistment"],
  cadetIntake: ["cadetintake", "cadet"],
  recruitIntake: ["recruitintake", "recruit"],
  intake: ["intake", "intakenumber", "batch"],
  currentPlaceOfStay: ["currentplaceofstay", "placeofstay", "residence", "currentresidence"],
  residentialAddress: ["residentialaddress", "houseaddress", "address"],
  digitalAddress: ["digitaladdress", "ghanapostgps", "gpsaddress"],
  postalAddress: ["postaladdress", "poboxaddress", "pobox"],
  residentialPhone: ["residentialtelephone", "residentialphone", "hometelephone", "homephone"],
  phone: ["mobile", "mobileno", "mobilenumber", "mobileno1", "phone", "phonenumber", "telephone", "contact", "contactnumber"],
  phone2: ["mobileno2", "mobile2", "altphone", "alternatephone", "secondphone", "othernumber"],
  email: ["email", "emailaddress", "mail"],
  heightCm: ["height", "heightcm"],
  bloodGroup: ["bloodgroup", "blood"],
  uniformSize: ["uniformsize", "uniform"],
  shoeSize: ["shoesize", "shoe", "footsize"],
  religion: ["religion", "faith", "denomination"],
  maritalStatus: ["maritalstatus", "marital"],
  numberOfChildren: ["numberofchildren", "children", "nochildren", "dependants"],
  previousLastPosition: ["lastpositionheld", "previousposition", "previouslastposition"],
  previousReasonForLeaving: ["reasonforleaving", "previousreasonforleaving"],
  hobby1: ["hobby", "hobbies", "hobbiesinterests", "interests"],
  specialSkill1: ["specialskill", "specialskills", "skills", "skill"],
  spouse_name: ["spouse", "spousename", "nameofspouse", "wifehusband"],
  spouse_phone: ["spousephone", "spousetelephone", "spousecontact"],
  spouse_address: ["spouseaddress", "spouseresidentialaddress"],
  nok_name: ["nextofkin", "nextofkinname", "nok", "nokname"],
  nok_relationship: ["nextofkinrelationship", "nokrelationship", "relationship"],
  nok_phone: ["nextofkinphone", "nokphone", "nextofkintelephone", "noktelephone", "nokcontact"],
  nok_address: ["nextofkinaddress", "nokaddress"],
  father_name: ["fathersname", "fathername", "father"],
  father_phone: ["fatherphone", "fatherstelephone", "fathertelephone"],
  mother_name: ["mothersname", "mothername", "mother"],
  mother_phone: ["motherphone", "motherstelephone", "mothertelephone"],
  bank_name: ["bank", "bankname"],
  bank_branch: ["branch", "bankbranch"],
  bank_account: ["accountnumber", "accountno", "bankaccount", "bankaccountnumber"],
  emergency_name: ["emergencycontact", "emergencycontactname", "emergencyname"],
  emergency_phone: ["emergencycontactphone", "emergencyphone", "emergencytelephone"],
  education_institution: ["school", "institution", "schoolattended", "institutionattended", "lastschoolattended"],
  education_qualification: ["qualification", "highestqualification", "certificate"],
  employment_employer: ["previousemployer", "employer", "previousorganization", "formeremployer"],
};

const HEADER_LOOKUP = new Map<string, string>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    if (!HEADER_LOOKUP.has(alias)) HEADER_LOOKUP.set(alias, field);
  }
}

/** Excel serial date (or free text date) → yyyy-MM-dd, else the trimmed text. */
export function normalizeSheetDate(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && raw > 20000 && raw < 60000) {
    const parsed = XLSX.SSF?.parse_date_code?.(raw);
    if (parsed) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
    }
  }
  const text = String(raw).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

const DATE_FIELDS = new Set(["dateOfBirth", "dateOfAppointment", "dateJoinedService"]);

function splitFullName(full: string) {
  const parts = full.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length === 0) return { lastName: "", firstName: "", otherNames: "" };
  // "SURNAME, First Other" is common on rosters
  if (full.includes(",")) {
    const [sur, rest = ""] = full.split(",");
    const restParts = rest.trim().split(" ").filter(Boolean);
    return {
      lastName: sur.trim(),
      firstName: restParts[0] ?? "",
      otherNames: restParts.slice(1).join(" "),
    };
  }
  return {
    lastName: parts[parts.length - 1],
    firstName: parts[0] ?? "",
    otherNames: parts.slice(1, -1).join(" "),
  };
}

/** Parse a spreadsheet file into review-ready prefill rows. */
export async function parseBioDataWorkbook(file: File): Promise<BioDataPrefillRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets to read");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) throw new Error("The first sheet has no rows");

  return rows.map((raw, i) => {
    const values: Record<string, string> = {};
    const unmapped: string[] = [];

    for (const [header, cell] of Object.entries(raw)) {
      const field = HEADER_LOOKUP.get(norm(header));
      const text = typeof cell === "number" ? String(cell) : String(cell ?? "").trim();
      if (!field) {
        if (text) unmapped.push(header);
        continue;
      }
      if (!text) continue;
      values[field] = DATE_FIELDS.has(field) ? normalizeSheetDate(cell) : text;
    }

    // Split a single "name" column when surname/first name are missing
    if (values.fullName && (!values.lastName || !values.firstName)) {
      const split = splitFullName(values.fullName);
      values.lastName ||= split.lastName;
      values.firstName ||= split.firstName;
      values.otherNames ||= split.otherNames;
    }
    delete values.fullName;

    const education = values.education_institution || values.education_qualification
      ? [{
          institution: values.education_institution ?? "",
          from_date: "", to_date: "",
          qualification: values.education_qualification ?? "",
        }]
      : [];
    const employment = values.employment_employer || values.previousLastPosition
      ? [{
          employer: values.employment_employer ?? "",
          position_held: values.previousLastPosition ?? "",
          from_date: "", to_date: "",
          reason_for_leaving: values.previousReasonForLeaving ?? "",
        }]
      : [];
    const emergency = values.emergency_name || values.emergency_phone
      ? [{
          name: values.emergency_name ?? "",
          relationship: "", phone: values.emergency_phone ?? "", address: "",
        }]
      : [];

    const label = [
      [values.lastName, values.firstName, values.otherNames].filter(Boolean).join(" "),
      values.staffId,
      values.rankName,
      values.departmentName,
    ].filter(Boolean).join(" · ") || `Row ${i + 1}`;

    return { index: i + 1, label, values, education, employment, emergency, unmapped };
  });
}

/** How many recognised values a row carries — shown in the picker. */
export function prefillFieldCount(row: BioDataPrefillRow): number {
  return Object.keys(row.values).length
    + row.education.length + row.employment.length + row.emergency.length;
}
