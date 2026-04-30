/**
 * GPS Hub offline cache.
 *
 * Persists the most recent GPS Hub points to localStorage so the map remains
 * usable when the connection is unstable (or temporarily offline). The cache
 * is intentionally small and bounded so it never bloats device storage.
 *
 * The cache is per-browser, never written to disk by any other module, and
 * only ever consumed by `GpsAddresses.tsx`.
 */
const STORAGE_KEY = "gpsHub.offlineCache.v1";
const SETTINGS_KEY = "gpsHub.offlineMode.v1";

/** Hard cap — bounds localStorage growth and keeps hydration instant. */
export const OFFLINE_CACHE_MAX = 200;

export interface OfflineGpsPoint {
  source: string;
  id: string;
  raw_location: string;
  digital_address: string | null;
  lat: number | null;
  lng: number | null;
  context: string;
  reference: string;
  status: string | null;
  created_at: string;
}

export interface OfflineCachePayload {
  cached_at: string;
  count: number;
  points: OfflineGpsPoint[];
}

export function isOfflineModeEnabled(): boolean {
  try {
    return localStorage.getItem(SETTINGS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOfflineModeEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(SETTINGS_KEY, "1");
    else localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage may be disabled — fail silently */
  }
}

export function readOfflineCache(): OfflineCachePayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineCachePayload;
    if (!parsed || !Array.isArray(parsed.points)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOfflineCache(points: OfflineGpsPoint[]) {
  try {
    const trimmed = points.slice(0, OFFLINE_CACHE_MAX);
    const payload: OfflineCachePayload = {
      cached_at: new Date().toISOString(),
      count: trimmed.length,
      points: trimmed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or disabled storage — no-op */
  }
}

export function clearOfflineCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
