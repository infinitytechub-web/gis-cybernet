// Lightweight IP geolocation with localStorage cache.
// Lookups are proxied through the `client-ip-info` edge function so the browser
// never sends staff IPs directly to third-party services.
import { supabase } from "@/integrations/supabase/client";

export interface IpGeo {
  ip: string;
  country?: string;
  country_code?: string;
  city?: string;
  region?: string;
  error?: boolean;
  cachedAt: number;
}

const CACHE_KEY = "ipGeoCache.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadCache(): Record<string, IpGeo> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, IpGeo>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota — ignore */ }
}

const inflight = new Map<string, Promise<IpGeo>>();

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("fe80")) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  return false;
}

export async function lookupIp(ip: string): Promise<IpGeo> {
  if (!ip) return { ip, error: true, cachedAt: Date.now() };
  if (isPrivateIp(ip)) {
    return { ip, country: "Private network", cachedAt: Date.now() };
  }

  const cache = loadCache();
  const hit = cache[ip];
  if (hit && Date.now() - hit.cachedAt < TTL_MS) return hit;

  if (inflight.has(ip)) return inflight.get(ip)!;

  const p = (async (): Promise<IpGeo> => {
    try {
      const { data: j, error } = await supabase.functions.invoke("client-ip-info", {
        body: { ip },
      });
      if (error || !j || (j as any).error) throw new Error(error?.message ?? "lookup failed");
      const geo: IpGeo = {
        ip,
        country: (j as any).country || undefined,
        country_code: (j as any).country_code || undefined,
        city: (j as any).city || undefined,
        region: (j as any).region || undefined,
        cachedAt: Date.now(),
      };
      const c = loadCache();
      c[ip] = geo;
      saveCache(c);
      return geo;
    } catch {
      const geo: IpGeo = { ip, error: true, cachedAt: Date.now() };
      // Cache failures briefly so we don't hammer the endpoint
      const c = loadCache();
      c[ip] = { ...geo, cachedAt: Date.now() - TTL_MS + 60_000 };
      saveCache(c);
      return geo;
    } finally {
      inflight.delete(ip);
    }
  })();

  inflight.set(ip, p);
  return p;
}

export function formatGeo(geo?: IpGeo): string {
  if (!geo) return "";
  if (geo.error) return "location unknown";
  const parts = [geo.city, geo.region, geo.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "location unknown";
}
