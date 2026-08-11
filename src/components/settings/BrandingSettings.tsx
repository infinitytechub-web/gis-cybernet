import { useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Palette, Save, RotateCcw, ShieldAlert, Upload, Trash2, Image as ImageIcon, Eye, Building2, Phone } from "lucide-react";

type ImageField = "logo_url" | "favicon_url" | "login_logo_url" | "dashboard_logo_url";

const IMAGE_FIELDS: { key: ImageField; label: string; hint: string; recommended: string; min: number; max: number }[] = [
  { key: "logo_url", label: "System logo", hint: "Shown in the sidebar header.", recommended: "512 × 512 px", min: 64, max: 2048 },
  { key: "favicon_url", label: "Favicon", hint: "Browser tab icon. Square PNG/SVG/ICO.", recommended: "64 × 64 px", min: 16, max: 512 },
  { key: "login_logo_url", label: "Login screen logo", hint: "Displayed above the sign-in form.", recommended: "600 × 600 px", min: 96, max: 2048 },
  { key: "dashboard_logo_url", label: "Dashboard logo", hint: "Displayed on the dashboard welcome banner.", recommended: "512 × 512 px", min: 64, max: 2048 },
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

/** Reads intrinsic pixel dimensions (skipped for SVG/ICO, which are scalable). */
function readDimensions(file: File): Promise<{ w: number; h: number } | null> {
  if (file.type === "image/svg+xml" || file.type.includes("icon")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const EDITABLE_KEYS: (keyof Branding)[] = [
  "system_label", "company_name", "org_name", "system_description", "header_text",
  "footer_text", "contact_email", "contact_phone", "contact_address", "contact_website",
  "logo_url", "favicon_url", "login_logo_url", "dashboard_logo_url",
  "primary_color", "secondary_color", "accent_color",
];

const SELECT_COLS =
  "id, org_name, system_label, company_name, logo_url, favicon_url, login_logo_url, dashboard_logo_url, " +
  "primary_color, secondary_color, accent_color, footer_text, system_description, header_text, " +
  "contact_email, contact_phone, contact_address, contact_website";

interface Row extends Branding { id: string }

export function BrandingSettings() {
  const { isAdmin, user } = useAuth();
  const refreshBranding = useRefreshBranding();

  const { data: row, isLoading, refetch } = useQuery({
    queryKey: ["branding-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(SELECT_COLS)
        .limit(1)
        .single();
      if (error) throw error;
      const cleaned = Object.fromEntries(
        Object.entries(data as unknown as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined),
      );
      return cleaned as unknown as Row;

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

  const changedKeys = useMemo(() => {
    if (!row) return [] as string[];
    return EDITABLE_KEYS.filter((k) => (form[k] ?? "") !== ((row as any)[k] ?? "")).map(String);
  }, [form, row]);
  const dirty = changedKeys.length > 0;

  async function handleUpload(field: ImageField, file: File) {
    if (!isAdmin) return;
    const spec = IMAGE_FIELDS.find((f) => f.key === field)!;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Unsupported image type", { description: "Use PNG, JPEG, WEBP, SVG or ICO." });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image too large", { description: "Maximum size is 2 MB." });
      return;
    }
    const dims = await readDimensions(file);
    if (dims) {
      const smallest = Math.min(dims.w, dims.h);
      const largest = Math.max(dims.w, dims.h);
      if (smallest < spec.min) {
        toast.error("Image resolution too low", {
          description: `${dims.w}×${dims.h} px. Minimum ${spec.min} px — recommended ${spec.recommended}.`,
        });
        return;
      }
      if (largest > spec.max) {
        toast.warning("Very large image", {
          description: `${dims.w}×${dims.h} px may slow page loads. Recommended ${spec.recommended}.`,
        });
      }
      const ratio = largest / smallest;
      if (field === "favicon_url" && ratio > 1.05) {
        toast.warning("Favicon should be square", { description: `Uploaded ${dims.w}×${dims.h} px.` });
      }
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
    toast.success("Image uploaded — review the preview, then Publish branding.");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row?.id) throw new Error("No settings row found");
      if (!form.company_name.trim()) throw new Error("Organization name is required.");
      if (!form.system_label.trim()) throw new Error("System name is required.");
      if (form.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
        throw new Error("Contact email is not a valid address.");
      }
      if (form.contact_website.trim() && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(form.contact_website.trim())) {
        throw new Error("Contact website is not a valid URL.");
      }

      const payload = {
        org_name: form.org_name.trim() || BRANDING_DEFAULTS.org_name,
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
        system_description: form.system_description.trim() || null,
        header_text: form.header_text.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_address: form.contact_address.trim() || null,
        contact_website: form.contact_website.trim() || null,
      };

      const { error } = await supabase
        .from("app_settings")
        .update(payload as never)
        .eq("id", row.id);
      if (error) throw error;

      // Audit trail — record which branding fields changed.
      await supabase.from("system_audit_log").insert({
        action: "branding_update",
        entity_type: "app_settings",
        entity_id: row.id,
        performed_by: user?.id ?? null,
        details: {
          changed_fields: changedKeys,
          before: Object.fromEntries(changedKeys.map((k) => [k, (row as any)[k] ?? null])),
          after: Object.fromEntries(changedKeys.map((k) => [k, (payload as any)[k] ?? null])),
        },
      } as never);
    },
    onSuccess: async () => {
      await refetch();
      refreshBranding();
      toast.success("Branding published — applied across the system.");
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
          <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-chart-1" /> Identity</CardTitle>
          <CardDescription>System and organization names shown in the header, sidebar and page titles.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="brand-brandname">Brand name</Label>
            <Input id="brand-brandname" value={form.org_name} maxLength={60} disabled={!isAdmin}
              onChange={(e) => set("org_name", e.target.value)} />
            <p className="text-xs text-muted-foreground">Leading word of the product name (e.g. “Cybernet”).</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-system">System name</Label>
            <Input id="brand-system" value={form.system_label} maxLength={60} disabled={!isAdmin}
              onChange={(e) => set("system_label", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-company">Organization name</Label>
            <Input id="brand-company" value={form.company_name} maxLength={120} disabled={!isAdmin}
              onChange={(e) => set("company_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-header">Header text (optional)</Label>
            <Input id="brand-header" value={form.header_text} maxLength={160} disabled={!isAdmin}
              placeholder="Shown beside the system title in the header"
              onChange={(e) => set("header_text", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brand-desc">System description</Label>
            <Textarea id="brand-desc" rows={2} value={form.system_description} maxLength={300} disabled={!isAdmin}
              placeholder="Short description used on the login screen and metadata"
              onChange={(e) => set("system_description", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4 text-primary" /> Preview</CardTitle>
          <CardDescription>
            Unsaved changes are shown here only. Nothing goes live until you publish.
            {dirty && <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700 dark:text-amber-400">{changedKeys.length} unpublished change{changedKeys.length === 1 ? "" : "s"}</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Login preview */}
          <div className="rounded-lg border p-4" style={{ background: `hsl(${form.secondary_color})` }}>
            <div className="mx-auto max-w-xs rounded-lg bg-background p-4 text-center space-y-2">
              <div className="mx-auto h-12 w-12 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                {previews.login_logo_url
                  ? <img src={previews.login_logo_url} alt="" className="h-full w-full object-contain" />
                  : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
              </div>
              <p className="font-bold" style={{ color: `hsl(${form.secondary_color})` }}>
                {form.org_name} {form.system_label}
              </p>
              <p className="text-xs text-muted-foreground">{form.company_name}</p>
              {form.system_description && <p className="text-[11px] text-muted-foreground">{form.system_description}</p>}
              <div className="h-8 rounded-md text-xs text-primary-foreground flex items-center justify-center"
                style={{ background: `hsl(${form.primary_color})` }}>
                Sign in
              </div>
            </div>
          </div>
          {/* Header + sidebar preview */}
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: `hsl(${form.secondary_color})` }}>
              <div className="h-6 w-6 rounded bg-white/10 flex items-center justify-center overflow-hidden">
                {previews.logo_url
                  ? <img src={previews.logo_url} alt="" className="h-full w-full object-contain" />
                  : <ImageIcon className="h-3.5 w-3.5 text-white/70" />}
              </div>
              <span className="text-sm font-semibold" style={{ color: `hsl(${form.accent_color})` }}>
                {form.org_name} {form.system_label}
              </span>
              {form.header_text && <span className="text-[11px] text-white/70 truncate">· {form.header_text}</span>}
            </div>
            <div className="flex">
              <div className="w-24 shrink-0 space-y-1 p-2" style={{ background: `hsl(${form.secondary_color} / 0.06)` }}>
                {["Dashboard", "Staff", "Reports"].map((n, i) => (
                  <div key={n} className="rounded px-2 py-1 text-[10px]"
                    style={i === 0 ? { background: `hsl(${form.primary_color})`, color: "white" } : undefined}>
                    {n}
                  </div>
                ))}
              </div>
              <div className="flex-1 p-3 text-xs text-muted-foreground">
                <div className="h-14 rounded-md border bg-muted/20 flex items-center justify-center overflow-hidden">
                  {previews.dashboard_logo_url
                    ? <img src={previews.dashboard_logo_url} alt="" className="h-full object-contain" />
                    : "Dashboard content"}
                </div>
              </div>
            </div>
            <div className="border-t px-3 py-1.5 text-center text-[10px] text-muted-foreground">
              {form.footer_text.trim() || BRANDING_DEFAULTS.footer_text}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-chart-2" /> Logos & favicon</CardTitle>
          <CardDescription>PNG, JPEG, WEBP, SVG or ICO up to 2 MB. Dimensions are validated on upload.</CardDescription>
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
                  <p className="text-xs text-muted-foreground">{f.hint} Recommended {f.recommended}.</p>
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

      {/* Contact & footer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-chart-3" /> Contact & footer</CardTitle>
          <CardDescription>Organization contact details and the footer shown on every authenticated page.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="brand-email">Contact email</Label>
            <Input id="brand-email" type="email" value={form.contact_email} maxLength={160} disabled={!isAdmin}
              onChange={(e) => set("contact_email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-phone">Contact phone</Label>
            <Input id="brand-phone" value={form.contact_phone} maxLength={60} disabled={!isAdmin}
              onChange={(e) => set("contact_phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-website">Website</Label>
            <Input id="brand-website" value={form.contact_website} maxLength={160} disabled={!isAdmin}
              placeholder="https://example.gov.gh"
              onChange={(e) => set("contact_website", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-address">Address</Label>
            <Input id="brand-address" value={form.contact_address} maxLength={200} disabled={!isAdmin}
              onChange={(e) => set("contact_address", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brand-footer">Footer information</Label>
            <Input id="brand-footer" value={form.footer_text} maxLength={200} disabled={!isAdmin}
              onChange={(e) => set("footer_text", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={!isAdmin || saveMutation.isPending || !dirty} className="gap-2">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saveMutation.isPending ? "Publishing…" : "Publish branding"}
        </Button>
        <Button variant="outline" disabled={!isAdmin || !dirty} onClick={() => row && setForm({ ...BRANDING_DEFAULTS, ...row })} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Discard changes
        </Button>
        <Button variant="ghost" disabled={!isAdmin}
          onClick={() => setForm({ ...BRANDING_DEFAULTS })} className="gap-2">
          Reset to system defaults
        </Button>
      </div>
    </div>
  );
}
