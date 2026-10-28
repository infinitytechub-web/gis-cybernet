import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBrands } from "@/hooks/useActiveBrand";
import { BRAND_TOKEN_KEYS, BRAND_TOKEN_LABELS, hexToHsl, hslToHex, validateBrandTokens, type AppBrand, type BrandTokens } from "@/lib/brands";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Copy, Trash2 } from "lucide-react";

export function BrandManager() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: brands = [], isLoading, error } = useBrands();
  const [draft, setDraft] = useState<{ id: string | null; name: string; tokens: BrandTokens } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["app-brands"] });

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); refresh(); return true;
  };

  const startCopy = (b: AppBrand) => setDraft({ id: null, name: `${b.name} copy`, tokens: { ...b.tokens } });
  const startEdit = (b: AppBrand) => setDraft({ id: b.id, name: b.name, tokens: { ...b.tokens } });

  const save = async () => {
    if (!draft) return;
    const err = validateBrandTokens(draft.tokens);
    if (err || !draft.name.trim()) { toast.error(err ?? "Enter a brand name"); return; }
    if (await run(() => supabase.rpc("save_brand", { _id: draft.id, _name: draft.name.trim(), _tokens: draft.tokens }), "Brand saved")) setDraft(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand colours</CardTitle>
        <CardDescription>Choose which saved brand the whole system uses. Brand 1 keeps the original colours.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading brands…</p>}
        {error && <p className="text-sm text-destructive">Could not load brands.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <div key={b.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{b.name}</span>
                {b.is_active && <Badge>Active</Badge>}
              </div>
              <div className="flex flex-wrap gap-1" aria-label={`${b.name} colours`}>
                {BRAND_TOKEN_KEYS.map((k) => (
                  <span key={k} title={BRAND_TOKEN_LABELS[k]} className="h-6 w-6 rounded border" style={{ background: `hsl(${b.tokens[k]})` }} />
                ))}
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {!b.is_active && <Button size="sm" disabled={busy} onClick={() => run(() => supabase.rpc("activate_brand", { _id: b.id }), `${b.name} applied`)}><Check className="h-4 w-4 mr-1" />Apply</Button>}
                  <Button size="sm" variant="outline" onClick={() => startCopy(b)}><Copy className="h-4 w-4 mr-1" />Copy</Button>
                  {!b.is_system && <Button size="sm" variant="outline" onClick={() => startEdit(b)}>Edit</Button>}
                  {!b.is_system && !b.is_active && <Button size="sm" variant="ghost" aria-label={`Delete ${b.name}`} disabled={busy} onClick={() => run(() => supabase.rpc("delete_brand", { _id: b.id }), "Brand deleted")}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              )}
            </div>
          ))}
        </div>

        {draft && (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="space-y-1 max-w-sm">
              <Label htmlFor="brand-name">Brand name</Label>
              <Input id="brand-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
              {BRAND_TOKEN_KEYS.map((k) => (
                <label key={k} className="flex flex-col gap-1 text-xs">
                  {BRAND_TOKEN_LABELS[k]}
                  <input type="color" className="h-9 w-full rounded border" value={hslToHex(draft.tokens[k])}
                    onChange={(e) => setDraft({ ...draft, tokens: { ...draft.tokens, [k]: hexToHsl(e.target.value) } })} />
                </label>
              ))}
            </div>
            <div className="rounded-lg border p-4" style={{ background: `hsl(${draft.tokens.background})`, color: `hsl(${draft.tokens.text})`, borderColor: `hsl(${draft.tokens.border})` }}>
              <p className="text-sm font-semibold mb-2">Preview</p>
              <div className="rounded p-3 mb-2" style={{ background: `hsl(${draft.tokens.surface})` }}>Card text</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["primary", "secondary", "accent", "success", "warning", "danger"] as const).map((k) => (
                  <span key={k} className="rounded px-2 py-1" style={{ background: `hsl(${draft.tokens[k]})`, color: "hsl(0 0% 100%)" }}>{BRAND_TOKEN_LABELS[k]}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={save}>Save brand</Button>
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
