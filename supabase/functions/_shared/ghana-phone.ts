/**
 * Ghana telephone validation shared by edge functions.
 * Mirrors src/lib/ghana-phone.ts and the SQL gh_phone_* helpers.
 */

export const GHANA_NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "054", "055", "059", "025", "053"],
  Telecel: ["020", "050"],
  AirtelTigo: ["026", "056", "027", "057"],
};

export function normalizeGhanaPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00233")) d = d.slice(5);
  else if (d.startsWith("233")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 9) return null;
  return `0${d}`;
}

export function ghanaNetwork(input: string | null | undefined): string | null {
  const local = normalizeGhanaPhone(input);
  if (!local) return null;
  const prefix = local.slice(0, 3);
  for (const [net, prefixes] of Object.entries(GHANA_NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) return net;
  }
  return null;
}

export function isValidGhanaPhone(input: string | null | undefined): boolean {
  return ghanaNetwork(input) !== null;
}

/**
 * Validate + canonicalise a comma-separated list.
 * Returns { value } on success or { error } describing the offending entry.
 */
export function normalizeGhanaPhoneList(
  input: string | null | undefined,
): { value: string | null; error?: string } {
  if (input === null || input === undefined || String(input).trim() === "") {
    return { value: null };
  }
  const parts = String(input).split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const local = normalizeGhanaPhone(part);
    if (!local || !ghanaNetwork(local)) {
      return {
        value: null,
        error:
          `Invalid Ghana telephone number "${part}" — expected 10 digits on MTN, Telecel or AirtelTigo`,
      };
    }
    out.push(local);
  }
  return { value: out.length ? out.join(", ") : null };
}
