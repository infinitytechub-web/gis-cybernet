import { useEffect } from "react";
import { useBranding } from "@/hooks/useBranding";

/**
 * Applies the admin-configured branding to the live document:
 *  - theme colors are written as CSS custom properties on <html>, so every
 *    Tailwind semantic token (primary / secondary / accent) follows them.
 *  - the favicon <link> and document title are swapped at runtime.
 * No redeploy or code change needed — a save propagates instantly.
 */
export function BrandingProvider({ children }: { children?: React.ReactNode }) {
  const b = useBranding();

  useEffect(() => {
    const root = document.documentElement;
    const apply = (name: string, value: string | null | undefined) => {
      if (value && /^\d/.test(value.trim())) root.style.setProperty(name, value.trim());
    };
    apply("--primary", b.primary_color);
    apply("--ring", b.primary_color);
    apply("--secondary", b.secondary_color);
    apply("--sidebar-primary", b.secondary_color);
    apply("--accent", b.accent_color);
  }, [b.primary_color, b.secondary_color, b.accent_color]);

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
