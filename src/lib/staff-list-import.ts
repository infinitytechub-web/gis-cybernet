/**
 * STAFF LIST IMPORT — reads a staff list spreadsheet (CSV / XLSX) and turns it
 * into rows the preview screen can show and the commit RPC can apply.
 *
 * The uploaded lists carry placeholder staff numbers (`xxxxxx`) and one shared
 * placeholder email, so both are generated here for the preview: the staff
 * number is issued by the database on commit, the email by the bulk account
 * tool, and the values shown are the same shapes those produce.
 */
import * as XLSX from "xlsx";

export type StaffListOutcome = "ready" | "skipped";

export interface StaffListRow {
  row_no: number;
  staff_id_raw: string;
  first_name: string;
  last_name: string;
  rank: string;
  unit: string;
  shift: string;
  intake: string;
  region: string;
  phone: string;
  gender: string;
  email_raw: string;
  /** Email the bulk account tool will generate (first.last@gis.local). */
  email_preview: string;
  outcome: StaffListOutcome;
  reason?: string;
}

const HEADER_ALIASES: Record<keyof Omit<StaffListRow, "row_no" | "email_preview" | "outcome" | "reason">, string[]> = {
  staff_id_raw: ["staffid", "staffno", "staffnumber", "servicenumber", "isnumber"],
  last_name: ["lastnamesurname", "lastname", "surname", "familyname"],
  first_name: ["firstname", "othernames", "forename", "givenname"],
  rank: ["rank", "ranks", "grade", "designation"],
  unit: ["unitdepartment", "unit", "department", "dept", "section", "posting", "appointment"],
  shift: ["shift", "shiftgroup", "group", "team"],
  intake: ["intake", "batch", "course"],
  region: ["region", "regionalcommand"],
  phone: ["telephonenumber", "telephone", "phone", "phonenumber", "mobile", "contact"],
  gender: ["gender", "sex", "mf", "fm"],
  email_raw: ["email", "emailaddress", "mail"],
};

const normHeader = (h: string) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Trim, collapse whitespace and drop stray punctuation from a rank label. */
export function normaliseRank(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case a name coming from an ALL CAPS roster. */
export function titleCase(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/** Ghana numbers arrive as 9 digits (leading zero lost) or as two numbers. */
export function normalisePhone(value: string): string {
  const first = String(value ?? "").split("/")[0].trim();
  const digits = first.replace(/[^0-9+]/g, "");
  if (/^\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

function slugEmail(first: string, last: string, taken: Set<string>): string {
  const base = `${first.trim().toLowerCase().replace(/[^a-z]/g, "")}.${last
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "")}`;
  let candidate = base;
  let n = 1;
  while (taken.has(candidate)) candidate = `${base}${n++}`;
  taken.add(candidate);
  return `${candidate}@gis.local`;
}

/** Read the first sheet of a CSV/XLSX staff list into parsed rows. */
export async function parseStaffListFile(file: File): Promise<{ rows: StaffListRow[]; unmapped: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", blankrows: false });
  if (!aoa.length) throw new Error("That file has no rows");

  // Find the header row: the first row that has both a name-ish and a rank column.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const norm = (aoa[i] ?? []).map((c) => normHeader(String(c ?? "")));
    const hasName = norm.some((n) => HEADER_ALIASES.last_name.includes(n) || HEADER_ALIASES.first_name.includes(n));
    const hasRank = norm.some((n) => HEADER_ALIASES.rank.includes(n));
    if (hasName && hasRank) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Could not find the column titles. Expected columns such as Rank, Surname and First Name.");
  }

  const headers = (aoa[headerIdx] ?? []).map((c) => normHeader(String(c ?? "")));
  const colOf = (key: keyof typeof HEADER_ALIASES) => {
    for (const alias of HEADER_ALIASES[key]) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cols = {
    staff_id_raw: colOf("staff_id_raw"),
    last_name: colOf("last_name"),
    first_name: colOf("first_name"),
    rank: colOf("rank"),
    unit: colOf("unit"),
    shift: colOf("shift"),
    intake: colOf("intake"),
    region: colOf("region"),
    phone: colOf("phone"),
    gender: colOf("gender"),
    email_raw: colOf("email_raw"),
  };

  const mapped = new Set(Object.values(cols).filter((i) => i >= 0));
  const unmapped = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => h && !mapped.has(i))
    .map(({ h }) => h);

  const taken = new Set<string>();
  const rows: StaffListRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const cell = (idx: number) => (idx >= 0 ? String(r[idx] ?? "").trim() : "");
    const last = titleCase(cell(cols.last_name));
    const first = titleCase(cell(cols.first_name));
    if (!last && !first) continue;

    const rank = normaliseRank(cell(cols.rank));
    const unit = cell(cols.unit).replace(/\s+/g, " ").trim();
    const shiftRaw = cell(cols.shift).toUpperCase().replace(/[^ABCD]/g, "");
    const intakeRaw = cell(cols.intake).replace(/[^0-9]/g, "");
    const gender = cell(cols.gender).toUpperCase().startsWith("F") ? "F" : cell(cols.gender) ? "M" : "";

    const row: StaffListRow = {
      row_no: i + 1,
      staff_id_raw: cell(cols.staff_id_raw),
      first_name: first,
      last_name: last,
      rank,
      unit,
      shift: shiftRaw.slice(0, 1),
      intake: intakeRaw,
      region: cell(cols.region),
      phone: normalisePhone(cell(cols.phone)),
      gender,
      email_raw: cell(cols.email_raw),
      email_preview: "",
      outcome: "ready",
    };

    if (!first || !last) {
      row.outcome = "skipped";
      row.reason = "Missing first or last name";
    } else if (!rank) {
      row.outcome = "skipped";
      row.reason = "Missing rank";
    } else {
      const key = `${first}|${last}`.toUpperCase();
      if (seen.has(key)) {
        row.outcome = "skipped";
        row.reason = "Duplicate of an earlier row in this file";
      } else {
        seen.add(key);
      }
    }

    if (row.outcome === "ready") row.email_preview = slugEmail(first, last, taken);
    rows.push(row);
  }

  if (!rows.length) throw new Error("No staff rows were found under the column titles");
  return { rows, unmapped };
}

/** Distinct unit/department values across the ready rows. */
export function distinctUnits(rows: StaffListRow[]): string[] {
  const set = new Set<string>();
  rows.filter((r) => r.outcome === "ready" && r.unit).forEach((r) => set.add(r.unit));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct normalised ranks across the ready rows. */
export function distinctRanks(rows: StaffListRow[]): string[] {
  const set = new Set<string>();
  rows.filter((r) => r.outcome === "ready" && r.rank).forEach((r) => set.add(r.rank));
  return [...set].sort((a, b) => a.localeCompare(b));
}
