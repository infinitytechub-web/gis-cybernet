/**
 * Trusted MAC address handling.
 *
 * Browsers cannot read a network adapter's MAC, so we rely on the value
 * being injected by a controlled context (kiosk launcher, MDM, corporate
 * VPN agent, etc.) that writes it into `localStorage` under `trusted-mac`.
 *
 * The value is normalized to the same canonical form used server-side
 * (`AA:BB:CC:DD:EE:FF`). Invalid values resolve to `null` so they never
 * trigger a false-positive block check.
 */
const STORAGE_KEY = "trusted-mac";

export function normalizeMac(input: string | null | undefined): string | null {
  if (!input) return null;
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

export function getTrustedMac(): string | null {
  try {
    return normalizeMac(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setTrustedMac(value: string | null): boolean {
  try {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    const norm = normalizeMac(value);
    if (!norm) return false;
    window.localStorage.setItem(STORAGE_KEY, norm);
    return true;
  } catch {
    return false;
  }
}
