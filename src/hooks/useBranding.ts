import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Branding {
  org_name: string;
  system_label: string;
  company_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  login_logo_url: string | null;
  dashboard_logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  footer_text: string;
}

/** Fallbacks used before the row loads, or if the request fails. */
export const BRANDING_DEFAULTS: Branding = {
  org_name: "GIS Amasaman Sector Command",
  system_label: "Cybernet",
  company_name: "Ghana Immigration Service",
  logo_url: null,
  favicon_url: null,
  login_logo_url: null,
  dashboard_logo_url: null,
  primary_color: "189 100% 27%",
  secondary_color: "220 80% 18%",
  accent_color: "152 70% 30%",
  footer_text: "Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026",
};

export const BRANDING_BUCKET = "branding";
const SIGNED_URL_TTL = 60 * 60 * 6; // 6h

const urlCache = new Map<string, { url: string; expires: number }>();

/**
 * Branding images are stored as object paths inside the private `branding`
 * bucket. Read access is granted to anon + authenticated, so the login screen
 * can resolve them too. Absolute URLs are passed through untouched.
 */
export async function resolveBrandingAsset(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^(https?:|data:|\/)/.test(path)) return path;

  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;

  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_TTL - 300) * 1000 });
  return data.signedUrl;
}

/**
 * Reads the singleton branding record through a public RPC that works both
 * signed-in and signed-out (login screen). Image paths are resolved to usable
 * URLs before the data reaches components.
 */
export function useBranding() {
  const { data } = useQuery({
    queryKey: ["branding"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Branding> => {
      const { data, error } = await (supabase as any).rpc("get_public_branding");
      if (error || !data) return BRANDING_DEFAULTS;
      const row = (Array.isArray(data) ? data[0] : data) as Branding | undefined;
      if (!row) return BRANDING_DEFAULTS;

      const [logo, favicon, login, dashboard] = await Promise.all([
        resolveBrandingAsset(row.logo_url),
        resolveBrandingAsset(row.favicon_url),
        resolveBrandingAsset(row.login_logo_url),
        resolveBrandingAsset(row.dashboard_logo_url),
      ]);

      return {
        ...BRANDING_DEFAULTS,
        ...row,
        logo_url: logo,
        favicon_url: favicon,
        login_logo_url: login,
        dashboard_logo_url: dashboard,
      };
    },
  });

  return data ?? BRANDING_DEFAULTS;
}

/** Call after saving branding so every open screen refreshes immediately. */
export function useRefreshBranding() {
  const qc = useQueryClient();
  return () => {
    urlCache.clear();
    qc.invalidateQueries({ queryKey: ["branding"] });
    qc.invalidateQueries({ queryKey: ["app-settings"] });
  };
}
