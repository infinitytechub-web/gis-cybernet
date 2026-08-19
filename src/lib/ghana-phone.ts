/**
 * Ghana staff telephone validation.
 *
 * Rules enforced system-wide (client AND server):
 *  - Local number is exactly 10 digits, starting with 0.
 *  - The 3-digit prefix must belong to a licensed Ghanaian mobile network.
 *  - Accepts +233 / 233 / 00233 international forms and normalises them.
 *  - Flags suspicious ("potentially forged") numbers: repeated digits,
 *    sequential runs, and known placeholder patterns.
 */

export type GhanaNetwork = "MTN" | "Telecel" | "AirtelTigo";

/** Licensed mobile prefixes by network (local 0XX form). */
export const GHANA_NETWORK_PREFIXES: Record<GhanaNetwork, string[]> = {
  // MTN Ghana
  MTN: ["024", "054", "055", "059", "025", "053"],
  // Telecel Ghana (formerly Vodafone)
  Telecel: ["020", "050"],
  // AirtelTigo
  AirtelTigo: ["026", "056", "027", "057"],
};

export const ALL_GHANA_PREFIXES: string[] = Object.values(GHANA_NETWORK_PREFIXES).flat();

export interface GhanaPhoneResult {
  /** Digits only, local 10-digit form (e.g. "0241234567") when valid. */
  local: string;
  /** E.164 form (e.g. "+233241234567") when valid. */
  e164: string;
  network: GhanaNetwork | null;
  valid: boolean;
  /** Valid prefix/length but the digit pattern looks fabricated. */
  suspicious: boolean;
  /** Human-readable reason when invalid or suspicious. */
  error: string | null;
}

const EMPTY: GhanaPhoneResult = {
  local: "",
  e164: "",
  network: null,
  valid: false,
  suspicious: false,
  error: null,
};

/** Strip everything except digits and a leading plus. */
export function stripPhone(input: string): string {
  return (input ?? "").replace(/[^\d+]/g, "");
}

/**
 * Reduce any accepted input form to a bare local 10-digit string when possible.
 * Returns "" when the input can't be interpreted as a Ghanaian local number.
 */
export function normalizeGhanaPhone(input: string): string {
  let s = stripPhone(input).replace(/^\+/, "");
  if (s.startsWith("00233")) s = s.slice(5);
  else if (s.startsWith("233")) s = s.slice(3);
  else if (s.startsWith("0")) s = s.slice(1);
  // At this point `s` should be the 9 national significant digits.
  if (s.length !== 9) return "";
  return `0${s}`;
}

export function networkForPrefix(prefix: string): GhanaNetwork | null {
  for (const [net, prefixes] of Object.entries(GHANA_NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) return net as GhanaNetwork;
  }
  return null;
}

/** Placeholder / fabricated subscriber-digit patterns (mirrors gh_phone_is_suspicious in SQL). */
const FABRICATED_SUBSCRIBERS = new Set([
  "0000000",
  "1234567",
  "7654321",
  "1111111",
  "0123456",
]);

function looksFabricated(local: string): boolean {
  const rest = local.slice(3); // 7 subscriber digits
  if (/^(\d)\1{6}$/.test(rest)) return true; // 0241111111
  if (FABRICATED_SUBSCRIBERS.has(rest)) return true;
  if (/^(\d\d)\1{2}\d$/.test(rest)) return true; // 1212123
  return false;
}

/** True when the number parses as Ghanaian but the digit pattern looks forged. */
export function isSuspiciousGhanaPhone(input: string): boolean {
  return validateGhanaPhone(input).suspicious;
}

/** Full validation + network detection for a single number. */
export function validateGhanaPhone(input: string): GhanaPhoneResult {
  const raw = stripPhone(input);
  if (!raw) return { ...EMPTY };

  const local = normalizeGhanaPhone(raw);
  if (!local) {
    const digits = raw.replace(/\D/g, "");
    return {
      ...EMPTY,
      error:
        digits.length > 12
          ? "Too many digits — a Ghana number has 10 local digits."
          : "Enter a 10-digit Ghana number (e.g. 024 123 4567).",
    };
  }

  const prefix = local.slice(0, 3);
  const network = networkForPrefix(prefix);
  if (!network) {
    return {
      ...EMPTY,
      local,
      error: `${prefix} is not a licensed Ghana network prefix (MTN, Telecel or AirtelTigo).`,
    };
  }

  const suspicious = looksFabricated(local);
  return {
    local,
    e164: `+233${local.slice(1)}`,
    network,
    valid: true,
    suspicious,
    error: suspicious ? "This number looks fabricated — please confirm it." : null,
  };
}

export function isValidGhanaPhone(input: string): boolean {
  return validateGhanaPhone(input).valid;
}

/** Display helper: 024 123 4567 */
export function formatGhanaPhone(input: string): string {
  const local = normalizeGhanaPhone(input);
  if (!local) return input ?? "";
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Validate a comma-separated list (legacy `profiles.phone` style storage). */
export function validateGhanaPhoneList(input: string): {
  valid: boolean;
  results: GhanaPhoneResult[];
  errors: string[];
} {
  const parts = (input ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const results = parts.map(validateGhanaPhone);
  const errors = results
    .map((r, i) =>
      r.valid && !r.suspicious ? null : `${parts[i]}: ${r.error ?? "invalid number"}`,
    )
    .filter((e): e is string => e !== null);
  return { valid: errors.length === 0, results, errors };
}

/**
 * Throws a user-facing Error when any number in a (possibly comma-separated)
 * field is not a genuine Ghana mobile number. Empty input is allowed unless
 * `required` is set. Returns the canonical value to persist ("" when blank).
 */
export function assertGhanaPhoneList(
  input: string | null | undefined,
  label = "Phone",
  required = false,
): string {
  const raw = (input ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
  if (!raw) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  const { valid, errors } = validateGhanaPhoneList(raw);
  if (!valid) throw new Error(`${label} — ${errors.join("; ")}`);
  return normalizeGhanaPhoneList(raw);
}

/** Normalise a list for persistence — returns the canonical local forms. */
export function normalizeGhanaPhoneList(input: string): string {
  return (input ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizeGhanaPhone(p) || p)
    .join(", ");
}

export const GHANA_PHONE_PLACEHOLDER = "0XX XXX XXXX";
export const GHANA_PHONE_HINT = "10 digits — MTN, Telecel or AirtelTigo";

/* ------------------------------------------------------------------ *
 * Contact-form validation (Ghana-strict, international-tolerant)
 *
 * Biodata forms across Front Desk / Processing / Detention capture the
 * numbers of foreign nationals too, so a bare 10-digit local number or a
 * +233 number is held to the full Ghana rules (licensed prefix, correct
 * length, not fabricated) while an explicit foreign dialling code is
 * accepted after a sanity check. Mirrors gh_phone_contact_check in SQL.
 * ------------------------------------------------------------------ */

export interface ContactPhoneResult {
  /** Canonical value to persist. */
  canonical: string;
  kind: "ghana" | "international";
  valid: boolean;
  error: string | null;
}

/** True when the input explicitly carries a non-Ghana international code. */
function isForeignDialled(raw: string): boolean {
  const s = stripPhone(raw);
  if (!s.startsWith("+") && !s.startsWith("00")) return false;
  const digits = s.replace(/\D/g, "").replace(/^00/, "");
  return !digits.startsWith("233");
}

const REPEATED_ALL = /^(\d)\1+$/;

export function validateContactPhone(input: string): ContactPhoneResult {
  const raw = stripPhone(input);
  if (!raw) return { canonical: "", kind: "ghana", valid: false, error: "Phone number is required" };

  if (isForeignDialled(raw)) {
    const digits = raw.replace(/\D/g, "").replace(/^00/, "");
    if (digits.length < 8 || digits.length > 15) {
      return {
        canonical: "",
        kind: "international",
        valid: false,
        error: "International numbers must have 8–15 digits including the country code.",
      };
    }
    if (REPEATED_ALL.test(digits) || /^123456/.test(digits.slice(-6))) {
      return { canonical: "", kind: "international", valid: false, error: "This number looks fabricated." };
    }
    return { canonical: `+${digits}`, kind: "international", valid: true, error: null };
  }

  const gh = validateGhanaPhone(raw);
  return {
    canonical: gh.valid && !gh.suspicious ? gh.local : "",
    kind: "ghana",
    valid: gh.valid && !gh.suspicious,
    error: gh.valid && !gh.suspicious ? null : gh.error ?? "Invalid number",
  };
}

export function isValidContactPhone(input: string): boolean {
  return validateContactPhone(input).valid;
}

export function validateContactPhoneList(input: string): { valid: boolean; errors: string[]; canonical: string } {
  const parts = (input ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const results = parts.map(validateContactPhone);
  const errors = results
    .map((r, i) => (r.valid ? null : `${parts[i]}: ${r.error ?? "invalid number"}`))
    .filter((e): e is string => e !== null);
  return {
    valid: errors.length === 0,
    errors,
    canonical: results.map((r, i) => r.canonical || parts[i]).join(", "),
  };
}

/**
 * Throws a user-facing Error when any number in a (possibly comma-separated)
 * contact field is invalid or looks forged. Returns the canonical value.
 */
export function assertContactPhoneList(
  input: string | null | undefined,
  label = "Phone",
  required = false,
): string {
  const raw = (input ?? "").split(",").map((p) => p.trim()).filter(Boolean).join(", ");
  if (!raw) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  const { valid, errors, canonical } = validateContactPhoneList(raw);
  if (!valid) throw new Error(`${label} — ${errors.join("; ")}`);
  return canonical;
}

export const CONTACT_PHONE_HINT = "Ghana: 10 digits (MTN, Telecel, AirtelTigo) · Foreign: +<country code>";
