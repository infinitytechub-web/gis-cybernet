import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  BRANDING_BUCKET,
  BRANDING_DEFAULTS,
  resolveBrandingAsset,
  useRefreshBranding,
  type Branding,
} from "@/hooks/useBranding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Palette, Save, RotateCcw, ShieldAlert, Upload, Trash2, Image as ImageIcon } from "lucide-react";

type ImageField = "logo_url" | "favicon_url" | "login_logo_url" | "dashboard_logo_url";

const IMAGE_FIELDS: { key: ImageField; label: string; hint: string }[] = [
  { key: "logo_url", label: "Company logo", hint: "Shown in the sidebar header." },
  { key: "favicon_url", label: "Favicon", hint: "Browser tab icon. Square PNG/SVG/ICO." },
  { key: "login_logo_url", label: "Login screen logo", hint: "Displayed above the sign-in form." },
  { key: "dashboard_logo_url", label: "Dashboard logo", hint: "Displayed on the dashboard welcome banner." },
];

const COLOR_FIELDS: { key: "primary_color" | "secondary_color" | "accent_color"; label: string; hint: string }[] = [
  { key: "primary_color", label: "Primary color", hint: "Buttons, links, focus rings." },
  { key: "secondary_color", label: "Secondary color", hint: "Headings and sidebar brand." },
  { key: "accent_color", label: "Accent color", hint: "Header title and highlights." },
];

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];

/** "189 100% 27%" -> "#rrggbb" for the native color picker. */
function hslToHex(hsl: string): string {
  const m = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return "#000000";
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface Row extends Branding { id: string }

export function BrandingSettings() {
  const { isAdmin } = useAuth();
  const refreshBranding = useRefreshBranding();

  const { data: row, isLoading, refetch } = useQuery({
    queryKey: ["branding-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id, org_name, system_label, company_name, logo_url, favicon_url, login_logo_url, dashboard_logo_url, primary_color, secondary_color, accent_color, footer_text")
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as Row;
    },
  });

  const [form, setForm] = useState<Branding>(BRANDING_DEFAULTS);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [uploading, setUploading] = useState<ImageField | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!row) return;
    setForm({ ...BRANDING_DEFAULTS, ...row });
  }, [row]);

  // Resolve stored object paths to viewable URLs for the previews.
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        IMAGE_FIELDS.map(async (f) => [f.key, await resolveBrandingAsset(form[f.key])] as const),
      );
      if (alive) setPreviews(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [form.logo_url, form.favicon_url, form.login_logo_url, form.dashboard_logo_url]);

  const set = <K extends keyof Branding>(key: K, value: Branding[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleUpload(field: ImageField, file: File) {
    if (!isAdmin) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Unsupported image type", { description: "Use PNG, JPEG, WEBP, SVG or ICO." });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image too large", { description: "Maximum size is 2 MB." });
      return;
    }
    setUploading(field);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${field}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    setUploading(null);
    if (error) {
      toast.error("Upload failed", { description: error.message });
      return;
    }
    set(field, path);
    toast.success("Image uploaded — click Save to publish.");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row?.id) throw new Error("No settings row found");
      if (!form.company_name.trim()) throw new Error("Company name is required.");
      if (!form.system_label.trim()) throw new Error("System name is required.");
      const { error } = await supabase
        .from("app_settings")
        .update({
          system_label: form.system_label.trim(),
          company_name: form.company_name.trim(),
          logo_url: form.logo_url,
          favicon_url: form.favicon_url,
          login_logo_url: form.login_logo_url,
          dashboard_logo_url: form.dashboard_logo_url,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          footer_text: form.footer_text.trim() || BRANDING_DEFAULTS.footer_text,
        } as never)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refetch();
      refreshBranding();
      toast.success("Branding updated — applied across the app.");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save branding."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading branding…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>Read-only — only System Administrators can change branding.</AlertDescription>
        </Alert>
      )}

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-chart-1" /> Identity</CardTitle>
          <CardDescription>System and company names shown in the header, sidebar and page titles.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="brand-system">System name</Label>
            <Input id="brand-system" value={form.system_label} maxLength={60} disabled={!isAdmin}
              onChange={(e) => set("system_label", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-company">Company name</Label>
            <Input id="brand-company" value={form.company_name} maxLength={120} disabled={!isAdmin}
              onChange={(e) => set("company_name", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-chart-2" /> Logos & favicon</CardTitle>
          <CardDescription>PNG, JPEG, WEBP, SVG or ICO up to 2 MB. Previews update immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {IMAGE_FIELDS.map((f, i) => (
            <div key={f.key}>
              {i > 0 && <Separator className="mb-5" />}
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {previews[f.key] ? (
                    <img src={previews[f.key] as string} alt={`${f.label} preview`} loading="lazy" decoding="async" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
                <input
                  ref={(el) => { inputs.current[f.key] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleUpload(f.key, file);
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={!isAdmin || uploading === f.key}
                    onClick={() => inputs.current[f.key]?.click()}>
                    {uploading === f.key ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    Upload
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!isAdmin || !form[f.key]}
                    onClick={() => set(f.key, null)}>
                    <Trash2 className="h-4 w-4 mr-1.5 text-destructive" /> Clear
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Theme colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-chart-4" /> Theme colors</CardTitle>
          <CardDescription>Applied live as CSS variables — no redeployment required.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {COLOR_FIELDS.map((c) => (
            <div key={c.key} className="grid grid-cols-1 sm:grid-cols-[auto,1fr,1fr] items-end gap-3">
              <input
                type="color"
                aria-label={c.label}
                value={hslToHex(form[c.key])}
                disabled={!isAdmin}
                onChange={(e) => set(c.key, hexToHsl(e.target.value))}
                className="h-10 w-14 rounded-md border bg-background p-1"
              />
              <div className="space-y-1.5">
                <Label htmlFor={`brand-${c.key}`}>{c.label}</Label>
                <Input id={`brand-${c.key}`} value={form[c.key]} disabled={!isAdmin}
                  onChange={(e) => set(c.key, e.target.value)} placeholder="189 100% 27%" />
              </div>
              <p className="text-xs text-muted-foreground pb-2">{c.hint} Format: <span className="font-mono">H S% L%</span></p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Footer information</CardTitle>
          <CardDescription>Shown at the bottom of every authenticated page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={form.footer_text} maxLength={200} disabled={!isAdmin}
            aria-label="Footer information"
            onChange={(e) => set("footer_text", e.target.value)} />
          <div className="rounded-md border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
            {form.footer_text.trim() || BRANDING_DEFAULTS.footer_text}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={!isAdmin || saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saveMutation.isPending ? "Saving…" : "Save branding"}
        </Button>
        <Button variant="outline" disabled={!isAdmin} onClick={() => setForm({ ...BRANDING_DEFAULTS, org_name: form.org_name })} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Button>
      </div>
    </div>
  );
}
