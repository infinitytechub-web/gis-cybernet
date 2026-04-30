import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { INTERLINK_LABELS } from "@/lib/interlink-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Save, RotateCcw, ShieldAlert } from "lucide-react";

/**
 * Admin-only screen to edit the Interlink page header title + tagline.
 * Falls back to INTERLINK_LABELS defaults when fields are blank.
 */
export function InterlinkBrandingSettings() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [title, setTitle] = useState<string>(INTERLINK_LABELS.title);
  const [tagline, setTagline] = useState<string>(INTERLINK_LABELS.tagline);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("interlink_branding")
        .select("title, tagline")
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setTitle(data.title ?? INTERLINK_LABELS.title);
        setTagline(data.tagline ?? INTERLINK_LABELS.tagline);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function handleSave() {
    if (!isAdmin) return;
    setSaving(true);
    const { error } = await supabase
      .from("interlink_branding")
      .update({
        title: title.trim() || INTERLINK_LABELS.title,
        tagline: tagline.trim() || INTERLINK_LABELS.tagline,
      })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("Could not save branding", { description: error.message });
      return;
    }
    toast.success("Interlink branding updated");
  }

  function handleReset() {
    setTitle(INTERLINK_LABELS.title);
    setTagline(INTERLINK_LABELS.tagline);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interlink branding</CardTitle>
        <CardDescription>
          Edit the title and tagline shown on the Interlink page header, sidebar, and dashboard widget.
          Leave a field blank to fall back to the system default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAdmin && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>Read-only — only Admins can edit Interlink branding.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="il-title">Title</Label>
          <Input
            id="il-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={INTERLINK_LABELS.title}
            maxLength={80}
            disabled={!isAdmin || loading}
          />
          <p className="text-xs text-muted-foreground">Default: <span className="font-mono">{INTERLINK_LABELS.title}</span></p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="il-tagline">Tagline</Label>
          <Input
            id="il-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder={INTERLINK_LABELS.tagline}
            maxLength={160}
            disabled={!isAdmin || loading}
          />
          <p className="text-xs text-muted-foreground">Default: <span className="font-mono">{INTERLINK_LABELS.tagline}</span></p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={!isAdmin || saving || loading} size="sm">
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleReset} variant="outline" size="sm" disabled={!isAdmin || loading}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to defaults
          </Button>
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Preview</p>
          <p className="text-base font-semibold">{title.trim() || INTERLINK_LABELS.title}</p>
          <p className="text-sm text-muted-foreground">{tagline.trim() || INTERLINK_LABELS.tagline}</p>
        </div>
      </CardContent>
    </Card>
  );
}
