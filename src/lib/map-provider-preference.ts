/**
 * Sticky map provider preference.
 *
 * Remembers whether the user pinned a specific tile provider and whether the
 * Google (proxied) tile service recently failed, so maps can start straight on
 * a working provider instead of retrying Google and flashing blank tiles.
 * Stored in localStorage; the Google-failure marker expires after 6 hours so a
 * restored Map Tiles API is picked up again automatically.
 */

export type MapProviderMode = "auto" | "google" | "osm" | "esri" | "opentopo";

export interface MapProviderPreference {
  mode: MapProviderMode;
  googleFailedAt?: number;
}

const STORAGE_KEY = "cybernet.map.provider";
export const GOOGLE_FAILURE_TTL_MS = 6 * 60 * 60 * 1000;

const DEFAULT: MapProviderPreference = { mode: "auto" };

const listeners = new Set<(pref: MapProviderPreference) => void>();

let cached: MapProviderPreference | null = null;

function read(): MapProviderPreference {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MapProviderPreference;
      const modes: MapProviderMode[] = ["auto", "google", "osm", "esri", "opentopo"];
      cached = {
        mode: modes.includes(parsed?.mode) ? parsed.mode : "auto",
        googleFailedAt: typeof parsed?.googleFailedAt === "number" ? parsed.googleFailedAt : undefined,
      };
      return cached;
    }
  } catch { /* ignore unreadable storage */ }
  cached = { ...DEFAULT };
  return cached;
}

function write(next: MapProviderPreference) {
  cached = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((fn) => { try { fn(next); } catch { /* ignore */ } });
}

export function getProviderPreference(): MapProviderPreference {
  return { ...read() };
}

export function getProviderMode(): MapProviderMode {
  return read().mode;
}

export function setProviderMode(mode: MapProviderMode) {
  const current = read();
  if (current.mode === mode) return;
  write({ ...current, mode });
}

/** Records that Google tiles failed, so Auto mode skips Google for a while. */
export function markGoogleFailed() {
  const current = read();
  const now = Date.now();
  // Avoid churning storage/listeners on every failed tile.
  if (current.googleFailedAt && now - current.googleFailedAt < 60_000) return;
  write({ ...current, googleFailedAt: now });
}

/** True when Google tiles failed within the TTL window. */
export function googleRecentlyFailed(): boolean {
  const { googleFailedAt } = read();
  if (!googleFailedAt) return false;
  if (Date.now() - googleFailedAt > GOOGLE_FAILURE_TTL_MS) return false;
  return true;
}

/** Clears the Google failure marker (e.g. user explicitly re-selects Google). */
export function clearGoogleFailure() {
  const current = read();
  if (!current.googleFailedAt) return;
  write({ mode: current.mode });
}

export function subscribeProviderPreference(fn: (pref: MapProviderPreference) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const PROVIDER_LABELS: Record<MapProviderMode, string> = {
  auto: "Auto (recommended)",
  google: "Google",
  osm: "OpenStreetMap",
  esri: "Esri Satellite",
  opentopo: "OpenTopoMap",
};
