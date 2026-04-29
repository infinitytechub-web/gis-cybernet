import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sliders, Save, RotateCcw, Sun, Moon, Globe2 } from "lucide-react";

type Shift = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type GlobalSettings = {
  id?: string;
  grace_minutes: number;
  early_checkin_minutes: number;
  late_checkout_minutes: number;
  enforce_window: boolean;
};

type Override = {
  id?: string;
  shift_id: string;
  grace_minutes: number | null;
  early_checkin_minutes: number | null;
  late_checkout_minutes: number | null;
  enforce_window: boolean | null;
  notes: string | null;
};

const DEFAULTS: GlobalSettings = {
  grace_minutes: 15,
  early_checkin_minutes: 30,
  late_checkout_minutes: 60,
  enforce_window: true,
};

function isNightShift(s: Shift) {
  if (!s.start_time) return false;
  const h = parseInt(s.start_time.slice(0, 2), 10);
  return h >= 18 || h < 6;
}

interface Props {
  shifts: Shift[];
}

export default function ShiftWindowRulesTab({ shifts }: Props) {
  const queryClient = useQueryClient();

  // ============ Global settings ============
  const { data: globalRow, isLoading: loadingGlobal } = useQuery({
    queryKey: ["attendance-window-settings", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_window_settings")
        .select("id, grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULTS) as GlobalSettings;
    },
  });

  const [g, setG] = useState<GlobalSettings>(DEFAULTS);
  useEffect(() => {
    if (globalRow) setG(globalRow);
  }, [globalRow]);

  const saveGlobal = useMutation({
    mutationFn: async () => {
      if (g.id) {
        const { error } = await supabase
          .from("attendance_window_settings")
          .update({
            grace_minutes: g.grace_minutes,
            early_checkin_minutes: g.early_checkin_minutes,
            late_checkout_minutes: g.late_checkout_minutes,
            enforce_window: g.enforce_window,
          })
          .eq("id", g.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_window_settings").insert({
          grace_minutes: g.grace_minutes,
          early_checkin_minutes: g.early_checkin_minutes,
          late_checkout_minutes: g.late_checkout_minutes,
          enforce_window: g.enforce_window,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Global window rules saved");
      queryClient.invalidateQueries({ queryKey: ["attendance-window-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  // ============ Per-shift overrides ============
  const { data: overrides = [], isLoading: loadingOverrides } = useQuery({
    queryKey: ["shift-window-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_attendance_window_overrides")
        .select("id, shift_id, grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window, notes");
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  const overrideByShift = useMemo(() => {
    const m = new Map<string, Override>();
    overrides.forEach((o) => m.set(o.shift_id, o));
    return m;
  }, [overrides]);

  return (
    <div className="space-y-4">
      {/* Global */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-primary" />
            Global window rules
          </CardTitle>
          <CardDescription>
            Default attendance window applied to all shifts unless an override is set below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingGlobal ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                <NumberField
                  label="Grace (min)"
                  value={g.grace_minutes}
                  onChange={(v) => setG({ ...g, grace_minutes: v })}
                />
                <NumberField
                  label="Earliest check-in (min before start)"
                  value={g.early_checkin_minutes}
                  onChange={(v) => setG({ ...g, early_checkin_minutes: v })}
                />
                <NumberField
                  label="Latest check-out (min after end)"
                  value={g.late_checkout_minutes}
                  onChange={(v) => setG({ ...g, late_checkout_minutes: v })}
                />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Enforce window</Label>
                    <div className="h-9 flex items-center">
                      <Switch
                        checked={g.enforce_window}
                        onCheckedChange={(v) => setG({ ...g, enforce_window: v })}
                      />
                      <span className="ml-2 text-xs text-muted-foreground">
                        {g.enforce_window ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveGlobal.mutate()} disabled={saveGlobal.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saveGlobal.isPending ? "Saving..." : "Save global rules"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-shift overrides */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            Per-shift overrides
          </CardTitle>
          <CardDescription>
            Customise grace and check-in/out windows per shift type (e.g. day vs night). Leave a field blank to inherit the global value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOverrides ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : shifts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shifts defined yet.</div>
          ) : (
            <div className="space-y-3">
              {shifts.map((s) => (
                <ShiftOverrideRow
                  key={s.id}
                  shift={s}
                  override={overrideByShift.get(s.id)}
                  global={g}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["shift-window-overrides"] })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        max={480}
        value={value ?? ""}
        onChange={(e) => onChange(Math.max(0, Math.min(480, parseInt(e.target.value || "0", 10))))}
      />
    </div>
  );
}

function ShiftOverrideRow({
  shift,
  override,
  global,
  onSaved,
}: {
  shift: Shift;
  override: Override | undefined;
  global: GlobalSettings;
  onSaved: () => void;
}) {
  const night = isNightShift(shift);
  const [grace, setGrace] = useState<string>(override?.grace_minutes?.toString() ?? "");
  const [early, setEarly] = useState<string>(override?.early_checkin_minutes?.toString() ?? "");
  const [late, setLate] = useState<string>(override?.late_checkout_minutes?.toString() ?? "");
  const [enforce, setEnforce] = useState<"inherit" | "on" | "off">(
    override?.enforce_window === null || override?.enforce_window === undefined
      ? "inherit"
      : override.enforce_window
        ? "on"
        : "off",
  );
  const [notes, setNotes] = useState<string>(override?.notes ?? "");

  useEffect(() => {
    setGrace(override?.grace_minutes?.toString() ?? "");
    setEarly(override?.early_checkin_minutes?.toString() ?? "");
    setLate(override?.late_checkout_minutes?.toString() ?? "");
    setEnforce(
      override?.enforce_window === null || override?.enforce_window === undefined
        ? "inherit"
        : override.enforce_window
          ? "on"
          : "off",
    );
    setNotes(override?.notes ?? "");
  }, [override?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const parse = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.min(480, parseInt(s, 10) || 0)));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        shift_id: shift.id,
        grace_minutes: parse(grace),
        early_checkin_minutes: parse(early),
        late_checkout_minutes: parse(late),
        enforce_window: enforce === "inherit" ? null : enforce === "on",
        notes: notes.trim() || null,
      };
      const { error } = await supabase
        .from("shift_attendance_window_overrides")
        .upsert(payload, { onConflict: "shift_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Override saved for ${shift.name}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const reset = useMutation({
    mutationFn: async () => {
      if (!override?.id) return;
      const { error } = await supabase
        .from("shift_attendance_window_overrides")
        .delete()
        .eq("id", override.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Reset ${shift.name} to global rules`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Reset failed"),
  });

  const hasOverride = !!override?.id;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {night ? (
            <Moon className="h-4 w-4 text-indigo-500" />
          ) : (
            <Sun className="h-4 w-4 text-amber-500" />
          )}
          <div>
            <div className="font-semibold text-sm">{shift.name}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {shift.start_time?.slice(0, 5) ?? "—"}–{shift.end_time?.slice(0, 5) ?? "—"}
              <span className="ml-1">· {night ? "night" : "day"}</span>
            </div>
          </div>
        </div>
        <Badge variant={hasOverride ? "default" : "outline"} className="text-[10px]">
          {hasOverride ? "Custom rule" : "Inherits global"}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Grace (min)</Label>
          <Input
            type="number"
            min={0}
            max={480}
            placeholder={`Inherit (${global.grace_minutes})`}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Earliest in (min before)</Label>
          <Input
            type="number"
            min={0}
            max={480}
            placeholder={`Inherit (${global.early_checkin_minutes})`}
            value={early}
            onChange={(e) => setEarly(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Latest out (min after)</Label>
          <Input
            type="number"
            min={0}
            max={480}
            placeholder={`Inherit (${global.late_checkout_minutes})`}
            value={late}
            onChange={(e) => setLate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Enforce</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={enforce}
            onChange={(e) => setEnforce(e.target.value as typeof enforce)}
          >
            <option value="inherit">Inherit ({global.enforce_window ? "on" : "off"})</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 300))}
          placeholder="e.g. Night duty allows 30m grace due to handover."
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {hasOverride && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to global
          </Button>
        )}
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving..." : "Save override"}
        </Button>
      </div>
    </div>
  );
}
