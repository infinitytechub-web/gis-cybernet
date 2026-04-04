import { supabase } from "@/integrations/supabase/client";

const signedUrlCache = new Map<string, { url: string; expires: number }>();
const SIGNED_URL_DURATION = 3600; // 1 hour

export async function getSignedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from("staff-photos")
    .createSignedUrl(path, SIGNED_URL_DURATION);

  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + (SIGNED_URL_DURATION - 60) * 1000,
  });

  return data.signedUrl;
}

/** React hook-friendly: use this in useQuery or useEffect */
export function usePhotoUrl(path: string | null) {
  // For synchronous fallback, return null; callers should use getSignedPhotoUrl in queries
  return path;
}
