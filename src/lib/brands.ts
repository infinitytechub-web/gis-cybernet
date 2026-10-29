export const BRAND_TOKEN_KEYS = [
  "primary", "secondary", "accent", "background", "surface",
  "text", "border", "success", "warning", "danger",
] as const;
export type BrandTokenKey = (typeof BRAND_TOKEN_KEYS)[number];
export type BrandTokens = Record<BrandTokenKey, string>;

export interface AppBrand {
  id: string;
  name: string;
  tokens: BrandTokens;
  is_active: boolean;
  is_system: boolean;
}

export const BRAND_TOKEN_LABELS: Record<BrandTokenKey, string> = {
  primary: "Primary", secondary: "Secondary", accent: "Accent", background: "Background",
  surface: "Surface (cards)", text: "Text", border: "Border", success: "Success",
  warning: "Warning", danger: "Danger",
};

const HSL_RE = /^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;
export const isHslToken = (v: unknown): v is string => typeof v === "string" && HSL_RE.test(v.trim());

export function validateBrandTokens(t: Partial<Record<string, unknown>>): string | null {
  for (const k of BRAND_TOKEN_KEYS) if (!isHslToken(t[k])) return `Invalid colour for ${BRAND_TOKEN_LABELS[k]}`;
  return null;
}

/** Text colour that stays readable on an HSL background. */
export function contrastFor(hsl: string): string {
  return contrastRatio(hsl, "0 0% 100%") >= contrastRatio(hsl, "155 45% 10%")
    ? "0 0% 100%" : "155 45% 10%";
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (value: string) => {
    const hex = hslToHex(value).slice(1);
    const channels = [0, 2, 4].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Maps brand tokens onto the app's shared CSS variables. */
export function brandToCssVars(t: BrandTokens, mode: "light" | "dark" = "light"): Record<string, string> {
  const dark = mode === "dark";
  const readable = (color: string) => {
    const [h, s] = color.split(" ");
    return `${h} ${s} 68%`;
  };
  const primary = dark ? readable(t.primary) : t.primary;
  const surface = dark ? "160 10% 12%" : t.surface;
  const background = dark ? "160 12% 8%" : t.background;
  const text = dark ? "150 10% 94%" : (contrastRatio(t.text, surface) >= 4.5 && contrastRatio(t.text, background) >= 4.5 ? t.text : contrastFor(background));
  return {
    "--primary": primary, "--primary-foreground": contrastFor(primary), "--ring": primary,
    "--secondary": t.secondary, "--secondary-foreground": contrastFor(t.secondary),
    "--brand-accent": dark ? readable(t.accent) : t.accent,
    "--background": background, "--foreground": text,
    "--card": surface, "--card-foreground": text,
    "--popover": surface, "--popover-foreground": text,
    "--border": dark ? "160 8% 30%" : t.border, "--input": dark ? "160 8% 42%" : "160 8% 50%",
    "--muted": dark ? "160 8% 18%" : "150 8% 94%",
    "--muted-foreground": dark ? "150 8% 72%" : "160 8% 36%",
    "--accent": dark ? "152 20% 20%" : "152 25% 92%",
    "--accent-foreground": dark ? "150 10% 94%" : "155 45% 10%",
    "--success": t.success, "--warning": t.warning,
    "--success-foreground": contrastFor(t.success), "--warning-foreground": contrastFor(t.warning),
    "--destructive": t.danger, "--destructive-foreground": contrastFor(t.danger),
    "--sidebar-primary": t.secondary, "--sidebar-primary-foreground": contrastFor(t.secondary), "--sidebar-ring": t.secondary,
  };
}

export function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslToHex(hsl: string): string {
  const [hs, ss, ls] = hsl.trim().split(" ");
  const h = Number(hs), s = Number(ss.replace("%", "")) / 100, l = Number(ls.replace("%", "")) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
