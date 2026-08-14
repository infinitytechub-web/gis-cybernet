import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { Save, RotateCcw, Calendar as CalendarIcon, Layers, Info } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useShiftRotationConfig } from "@/hooks/useShiftRotationConfig";
import { DateInput } from "@/components/ui/date-input";

const DEFAULT_ANCHOR = "2026-05-01";
const DEFAULT_PATTERN = "A,B,C,D";

function parsePattern(input: string): { ok: true; pattern: string[] } | { ok: false; error: string } {
  const parts = input
    .split(/[,\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Pattern cannot be empty." };
  if (parts.length > 12) return { ok: false, error: "Pattern is limited to 12 entries." };
  for (const p of parts) {
    if (!/^[A-Z]$/.test(p)) {
      return { ok: false, error: `"${p}" is not a single uppercase letter (A–Z).` };
    }
  }
  return { ok: true, pattern: parts };
}

export function ShiftRotationSettings() {
  const qc = useQueryClient();
  const { config, isLoading } = useShiftRotationConfig();

  const [anchor, setAnchor] = useState(DEFAULT_ANCHOR);
  const [patternText, setPatternText] = useState(DEFAULT_PATTERN);

  // Hydrate form from server.
  useEffect(() => {
    if (!isLoading) {
      setAnchor(config.anchorIso);
      setPatternText(config.pattern.join(","));
    }
  }, [isLoading, config.anchorIso, config.pattern]);

  const parsed = useMemo(() => parsePattern(patternText), [patternText]);
  const previewPattern = parsed.ok ? parsed.pattern : config.pattern;

  // 14-day live preview from the entered anchor + pattern.
  const preview = useMemo(() => {
    let start: Date;
    try {
      start = parseISO(anchor);
      if (Number.isNaN(start.getTime())) throw new Error();
    } catch {
      return [] as Array<{ date: Date; group: string }>;
    }
    return Array.from({ length: 14 }).map((_, i) => {
      const d = addDays(start, i);
      const idx = ((i % previewPattern.length) + previewPattern.length) % previewPattern.length;
      return { date: d, group: previewPattern[idx] };
    });
  }, [anchor, previewPattern]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error((parsed as { ok: false; error: string }).error);
      if (!anchor) throw new Error("Anchor date is required.");
      const { error } = await supabase
        .from("shift_rotation_config" as any)
        .update({ anchor_date: anchor, pattern: (parsed as { ok: true; pattern: string[] }).pattern })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotation configuration saved");
      qc.invalidateQueries({ queryKey: ["shift-rotation-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save rotation"),
  });

  const resetDefaults = () => {
    setAnchor(DEFAULT_ANCHOR);
    setPatternText(DEFAULT_PATTERN);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          Shift Rotation Configuration
        </CardTitle>
        <CardDescription>
          Sets the anchor date and the daily group pattern used to auto-generate every staff member's
          calendar in <strong>My Shift Tracker</strong>. Changes apply instantly across the system.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="anchor-date" className="flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Anchor date
            </Label>
            <DateInput
              id="anchor-date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The first calendar day of the rotation. The pattern's <strong>first letter</strong> applies on this date.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pattern" className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              Pattern (comma-separated)
            </Label>
            <Input
              id="pattern"
              value={patternText}
              onChange={(e) => setPatternText(e.target.value)}
              placeholder="A,B,C,D"
              className="font-mono uppercase"
            />
            {!parsed.ok ? (
              <p className="text-xs text-destructive">{(parsed as { ok: false; error: string }).error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {(parsed as { ok: true; pattern: string[] }).pattern.length} groups · cycles every {(parsed as { ok: true; pattern: string[] }).pattern.length} day{(parsed as { ok: true; pattern: string[] }).pattern.length === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Live 14-day preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> 14-day preview from anchor
            </Label>
            <Badge variant="secondary" className="text-[10px]">
              Source: {config.source === "db" ? "saved config" : "default"}
              {config.updatedAt ? ` · last saved ${format(parseISO(config.updatedAt), "dd/MM/yyyy HH:mm")}` : ""}
            </Badge>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {preview.map((p) => (
              <div
                key={p.date.toISOString()}
                className="rounded-md border bg-card p-1.5 flex flex-col items-center gap-0.5"
              >
                <span className="text-[10px] text-muted-foreground">{format(p.date, "EEE")}</span>
                <span className="font-semibold tabular-nums">{format(p.date, "d MMM")}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {p.group}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={resetDefaults} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !parsed.ok}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save rotation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
