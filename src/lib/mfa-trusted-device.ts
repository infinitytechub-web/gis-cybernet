// src/lib/mfa-trusted-device.ts
// "Remember this device" for 2FA step-up: after a successful challenge the
// browser stores a short-lived, device-bound grant so client-side step-up
// prompts are skipped until it expires. Grants never replace server-side AAL2
// checks — actions the backend guards still require a real verified session.
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

const STORAGE_KEY = "cybernet.mfa.trusted-device";

/** Selectable remember durations (hours). */
export const TRUSTED_DEVICE_DURATIONS = [4, 8, 12, 24] as const;
export const DEFAULT_TRUSTED_DEVICE_HOURS = 12;
/** Hard ceiling — a grant is never honoured beyond this age. */
export const MAX_TRUSTED_DEVICE_HOURS = 24;

interface TrustGrant {
  userId: string;
  fingerprint: string;
  expiresAt: number;
}

function read(): TrustGrant | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrustGrant;
    if (!parsed?.userId || !parsed?.fingerprint || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTrustedDevice() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Persists a grant for this user on this device. */
export async function rememberTrustedDevice(userId: string, hours = DEFAULT_TRUSTED_DEVICE_HOURS) {
  const capped = Math.min(Math.max(hours, 1), MAX_TRUSTED_DEVICE_HOURS);
  const grant: TrustGrant = {
    userId,
    fingerprint: await getDeviceFingerprint(),
    expiresAt: Date.now() + capped * 60 * 60 * 1000,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grant));
  } catch {
    /* storage unavailable — grant simply won't persist */
  }
}

/** Remaining valid grant for this user/device, or null. */
export async function getTrustedDeviceGrant(userId: string | undefined | null) {
  if (!userId) return null;
  const grant = read();
  if (!grant || grant.userId !== userId) return null;
  if (grant.expiresAt <= Date.now()) {
    clearTrustedDevice();
    return null;
  }
  const fingerprint = await getDeviceFingerprint();
  if (fingerprint && grant.fingerprint && fingerprint !== grant.fingerprint) {
    clearTrustedDevice();
    return null;
  }
  return { expiresAt: new Date(grant.expiresAt) };
}

export async function isTrustedDevice(userId: string | undefined | null) {
  return !!(await getTrustedDeviceGrant(userId));
}
