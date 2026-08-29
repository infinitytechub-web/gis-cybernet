// Google reCAPTCHA v3 client helper.
//
// v3 is invisible: no checkbox, no puzzle. The script is loaded lazily the
// first time a protected action needs a token, and only when an administrator
// has switched protection on and stored a site key (Settings → Security →
// Bot protection). Everything degrades gracefully: if the config is off or the
// script cannot load, `executeRecaptcha` returns null and the server-side check
// simply has no token to validate.

import { supabase } from "@/integrations/supabase/client";

export interface RecaptchaConfig {
  enabled: boolean;
  siteKey: string | null;
  minScore: number;
}

const OFF: RecaptchaConfig = { enabled: false, siteKey: null, minScore: 0.5 };

let configPromise: Promise<RecaptchaConfig> | null = null;
let scriptPromise: Promise<boolean> | null = null;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

/** Reads the public (site key / enabled / threshold) part of the policy. */
export async function getRecaptchaConfig(): Promise<RecaptchaConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_recaptcha_config");
        if (error) return OFF;
        const row = Array.isArray(data) ? data[0] : data;
        const siteKey = typeof row?.site_key === "string" ? row.site_key.trim() : "";
        const min = Number(row?.min_score ?? 0.5);
        return {
          enabled: row?.enabled === true && siteKey.length > 0,
          siteKey: siteKey || null,
          minScore: Number.isFinite(min) ? min : 0.5,
        };
      } catch {
        return OFF;
      }
    })();
  }
  return configPromise;
}

/** Clears the cached config (called after an admin saves new settings). */
export function resetRecaptchaConfigCache() {
  configPromise = null;
  scriptPromise = null;
}

function loadScript(siteKey: string): Promise<boolean> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") return resolve(false);
    if (window.grecaptcha) return resolve(true);

    const existing = document.getElementById("recaptcha-v3-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "recaptcha-v3-script";
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Returns a fresh reCAPTCHA v3 token for `action`, or null when protection is
 * off / unavailable. Tokens are single-use and expire after ~2 minutes, so this
 * must be called immediately before the request it protects.
 */
export async function executeRecaptcha(action: string): Promise<string | null> {
  const config = await getRecaptchaConfig();
  if (!config.enabled || !config.siteKey) return null;

  const loaded = await loadScript(config.siteKey);
  if (!loaded || !window.grecaptcha) return null;

  try {
    return await new Promise<string | null>((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 10_000);
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(config.siteKey as string, { action })
          .then((token) => {
            window.clearTimeout(timeout);
            resolve(token || null);
          })
          .catch(() => {
            window.clearTimeout(timeout);
            resolve(null);
          });
      });
    });
  } catch {
    return null;
  }
}

/** Warms up the script so the first protected submit is not delayed. */
export function preloadRecaptcha() {
  void getRecaptchaConfig().then((c) => {
    if (c.enabled && c.siteKey) void loadScript(c.siteKey);
  });
}
