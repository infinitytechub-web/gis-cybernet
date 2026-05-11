// Cached "what is my IP" lookup. The `client-ip-info` edge function (called
// without a body) round-trips ~1.5s, and several places ask for the same
// answer per session (Login, MfaGate, ForcedSignoutWatcher, audit helpers).
// Cache for the lifetime of the tab + dedupe in-flight calls so the network
// pays for it at most once.
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "myClientIp.v1";
const TTL_MS = 5 * 60 * 1000; // 5 minutes
let inflight: Promise<string | null> | null = null;

interface Cached { ip: string | null; at: number }

function read(): Cached | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function write(ip: string | null) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ip, at: Date.now() })); } catch { /* quota */ }
}

export async function getMyClientIp(): Promise<string | null> {
  const hit = read();
  if (hit) return hit.ip;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase.functions.invoke("client-ip-info");
      const ip = (data as any)?.ip ?? null;
      write(ip);
      return ip;
    } catch {
      // Cache the failure briefly so we don't hammer the edge function.
      write(null);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
