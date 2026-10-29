import { useEffect } from "react";
import { useBranding } from "@/hooks/useBranding";
import { useBrands } from "@/hooks/useActiveBrand";
import { brandToCssVars, validateBrandTokens } from "@/lib/brands";

/**
 * Applies the admin-configured branding to the live document.
 * The active saved brand (Brand 1, Brand 2, …) sets every shared colour
 * token; the legacy single-colour settings only apply when no brand is active.
 */
export function BrandingProvider({ children }: { children?: React.ReactNode }) {
  const b = useBranding();
  const { data: brands } = useBrands();
  const active = brands?.find((x) => x.is_active && !validateBrandTokens(x.tokens));

  useEffect(() => {
    const stylesheet = document.createElement("style");
    stylesheet.dataset.brandTheme = "active";
    if (active) {
      stylesheet.textContent = (["light", "dark"] as const).map((mode) => {
        const vars = brandToCssVars(active.tokens, mode);
        return `${mode === "dark" ? ":root.dark" : ":root:not(.dark)"} { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
      }).join("\n");
      document.head.appendChild(stylesheet);
      return () => { stylesheet.remove(); };
    }
    const vars: Record<string, string> = {};
    const apply = (name: string, value: string | null | undefined) => {
      if (value && !validateBrandTokens({ primary: value, secondary: value, accent: value, background: value, surface: value, text: value, border: value, success: value, warning: value, danger: value })) vars[name] = value.trim();
    };
    apply("--primary", b.primary_color);
    apply("--ring", b.primary_color);
    apply("--secondary", b.secondary_color);
    apply("--sidebar-primary", b.secondary_color);
    apply("--brand-accent", b.accent_color);
    stylesheet.textContent = `:root:not(.dark) { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
    document.head.appendChild(stylesheet);
    return () => { stylesheet.remove(); };
  }, [active, b.primary_color, b.secondary_color, b.accent_color]);

  useEffect(() => {
    if (!b.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.favicon_url;
  }, [b.favicon_url]);

  useEffect(() => {
    document.title = `${b.system_label} — ${b.company_name}`;
  }, [b.system_label, b.company_name]);

  return <>{children}</>;
}
