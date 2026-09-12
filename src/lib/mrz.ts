/**
 * Machine Readable Zone (MRZ) reader for passports and ID cards.
 *
 * Supports the two ICAO 9303 layouts used by Ghanaian travel and identity
 * documents:
 *   TD3 — passports: 2 lines of 44 characters
 *   TD1 — ID cards (incl. Ghana Card): 3 lines of 30 characters
 *
 * Everything here is pure text handling so it can be unit tested and reused by
 * a hardware reader later: a device only has to hand over the raw MRZ lines.
 */

export type MrzResult = {
  format: "TD1" | "TD3";
  documentType: string;
  documentNumber: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  nationality: string;
  sex: string;
  /** ISO yyyy-MM-dd */
  dateOfBirth: string | null;
  /** ISO yyyy-MM-dd */
  expiryDate: string | null;
  checksumValid: boolean;
  /** Per-field check digit results, for showing what failed. */
  checks: { field: string; ok: boolean }[];
  raw: string;
};

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return 0;
}

export function mrzCheckDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += charValue(input[i]) * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function verify(field: string, value: string, digit: string) {
  const ok = /^\d$/.test(digit) && mrzCheckDigit(value) === Number(digit);
  return { field, ok };
}

/** MRZ dates are YYMMDD. Birth dates map into the past, expiry into the future. */
function mrzDate(yymmdd: string, kind: "birth" | "expiry"): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  const nowYY = new Date().getFullYear() % 100;
  let century: number;
  if (kind === "birth") century = yy > nowYY ? 1900 : 2000;
  else century = yy < 70 ? 2000 : 1900;
  return `${century + yy}-${mm}-${dd}`;
}

function names(field: string) {
  const [surname = "", given = ""] = field.split("<<");
  return {
    surname: surname.replace(/</g, " ").trim(),
    givenNames: given.replace(/</g, " ").trim(),
  };
}

function sexOf(c: string) {
  if (c === "M") return "Male";
  if (c === "F") return "Female";
  return "";
}

const clean = (line: string) => line.toUpperCase().replace(/[^A-Z0-9<]/g, "");

/**
 * Parse raw MRZ text (2 or 3 lines, separators flexible).
 * Returns null when the text is not a recognisable MRZ.
 */
export function parseMrz(input: string): MrzResult | null {
  const lines = input
    .split(/[\r\n]+/)
    .map((l) => clean(l))
    .filter(Boolean);
  if (lines.length < 2) return null;

  // TD3 — passport
  if (lines.length === 2 && lines[0].length >= 40) {
    const l1 = lines[0].padEnd(44, "<").slice(0, 44);
    const l2 = lines[1].padEnd(44, "<").slice(0, 44);
    const { surname, givenNames } = names(l1.slice(5));
    const documentNumber = l2.slice(0, 9).replace(/</g, "");
    const dob = l2.slice(13, 19);
    const expiry = l2.slice(21, 27);
    const checks = [
      verify("Document number", l2.slice(0, 9), l2[9]),
      verify("Date of birth", dob, l2[19]),
      verify("Expiry date", expiry, l2[27]),
      verify(
        "Composite",
        l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43),
        l2[43],
      ),
    ];
    return {
      format: "TD3",
      documentType: l1.slice(0, 2).replace(/</g, ""),
      documentNumber,
      issuingCountry: l1.slice(2, 5).replace(/</g, ""),
      surname,
      givenNames,
      nationality: l2.slice(10, 13).replace(/</g, ""),
      sex: sexOf(l2[20]),
      dateOfBirth: mrzDate(dob, "birth"),
      expiryDate: mrzDate(expiry, "expiry"),
      checksumValid: checks.every((c) => c.ok),
      checks,
      raw: [l1, l2].join("\n"),
    };
  }

  // TD1 — ID card
  if (lines.length >= 3) {
    const l1 = lines[0].padEnd(30, "<").slice(0, 30);
    const l2 = lines[1].padEnd(30, "<").slice(0, 30);
    const l3 = lines[2].padEnd(30, "<").slice(0, 30);
    const { surname, givenNames } = names(l3);
    const dob = l2.slice(0, 6);
    const expiry = l2.slice(8, 14);
    const checks = [
      verify("Document number", l1.slice(5, 14), l1[14]),
      verify("Date of birth", dob, l2[6]),
      verify("Expiry date", expiry, l2[14]),
      verify(
        "Composite",
        l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29),
        l2[29],
      ),
    ];
    return {
      format: "TD1",
      documentType: l1.slice(0, 2).replace(/</g, ""),
      documentNumber: l1.slice(5, 14).replace(/</g, ""),
      issuingCountry: l1.slice(2, 5).replace(/</g, ""),
      surname,
      givenNames,
      nationality: l2.slice(15, 18).replace(/</g, ""),
      sex: sexOf(l2[7]),
      dateOfBirth: mrzDate(dob, "birth"),
      expiryDate: mrzDate(expiry, "expiry"),
      checksumValid: checks.every((c) => c.ok),
      checks,
      raw: [l1, l2, l3].join("\n"),
    };
  }

  return null;
}

/**
 * Reader hook for a future deployment integration (document scanner, OCR
 * service or vendor SDK). Register one with `setMrzImageReader` and the scan
 * panel will use it automatically; until then officers key in or paste the MRZ
 * lines from the document.
 */
export type MrzImageReader = (file: File) => Promise<string | null>;

let imageReader: MrzImageReader | null = null;

export function setMrzImageReader(reader: MrzImageReader | null) {
  imageReader = reader;
}

export function hasMrzImageReader() {
  return imageReader !== null;
}

export async function readMrzFromImage(file: File): Promise<string | null> {
  if (!imageReader) return null;
  return imageReader(file);
}
