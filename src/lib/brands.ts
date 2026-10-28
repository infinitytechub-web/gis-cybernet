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
  const l = Number(hsl.trim().split(" ")[2]?.replace("%", "") ?? 50);
  return l > 60 ? "155 45% 10%" : "0 0% 100%";
}

/** Maps brand tokens onto the app's shared CSS variables. */
export function brandToCssVars(t: BrandTokens): Record<string, string> {
  return {
    "--primary": t.primary, "--primary-foreground": contrastFor(t.primary), "--ring": t.primary,
    "--secondary": t.secondary, "--secondary-foreground": contrastFor(t.secondary),
    "--brand-accent": t.accent,
    "--background": t.background, "--foreground": t.text,
    "--card": t.surface, "--card-foreground": t.text,
    "--popover": t.surface, "--popover-foreground": t.text,
    "--border": t.border, "--input": t.border,
    "--success": t.success, "--warning": t.warning,
    "--destructive": t.danger, "--destructive-foreground": contrastFor(t.danger),
    "--sidebar-primary": t.primary, "--sidebar-ring": t.primary,
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
