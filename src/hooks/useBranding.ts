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
  system_description: string;
  header_text: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  contact_website: string;
  login_tagline: string;
  login_background_url: string | null;
  email_from_name: string;
  email_reply_to: string;
  email_header_color: string;
  email_logo_url: string | null;
  email_footer_text: string;
  email_signature: string;
}

/** Fallbacks used before the row loads, or if the request fails. */
export const BRANDING_DEFAULTS: Branding = {
  org_name: "Cybernet",
  system_label: "HRM System",
  company_name: "Ghana Immigration Service",
  logo_url: null,
  favicon_url: null,
  login_logo_url: null,
  dashboard_logo_url: null,
  primary_color: "189 100% 27%",
  secondary_color: "220 80% 18%",
  accent_color: "152 70% 30%",
  footer_text: "Powered by: Infinity Techub Intelligence | All Rights Reserved: 2026",
  system_description: "",
  header_text: "",
  contact_email: "",
  contact_phone: "",
  contact_address: "",
  contact_website: "",
  login_tagline: "",
  login_background_url: null,
  email_from_name: "",
  email_reply_to: "",
  email_header_color: "220 80% 18%",
  email_logo_url: null,
  email_footer_text: "",
  email_signature: "",
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

      const [logo, favicon, login, dashboard, loginBackground] = await Promise.all([
        resolveBrandingAsset(row.logo_url),
        resolveBrandingAsset(row.favicon_url),
        resolveBrandingAsset(row.login_logo_url),
        resolveBrandingAsset(row.dashboard_logo_url),
        resolveBrandingAsset(row.login_background_url ?? null),
      ]);

      // The RPC returns NULL for unset text fields — strip them so the
      // defaults above win instead of rendering "null".
      const cleaned = Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== null && v !== undefined),
      ) as Partial<Branding>;

      return {
        ...BRANDING_DEFAULTS,
        ...cleaned,

        logo_url: logo,
        favicon_url: favicon,
        login_logo_url: login,
        dashboard_logo_url: dashboard,
        login_background_url: loginBackground,
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
