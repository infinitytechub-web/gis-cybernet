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
import { Sliders, Save, RotateCcw, Sun, Moon, Globe2, Plus, Trash2, CalendarRange } from "lucide-react";

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
  effective_from: string | null;
  effective_to: string | null;
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
        .select("id, shift_id, grace_minutes, early_checkin_minutes, late_checkout_minutes, enforce_window, notes, effective_from, effective_to")
        .order("effective_from", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  const overridesByShift = useMemo(() => {
    const m = new Map<string, Override[]>();
    overrides.forEach((o) => {
      const arr = m.get(o.shift_id) ?? [];
      arr.push(o);
      m.set(o.shift_id, arr);
    });
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
            Customise grace and check-in/out windows per shift, optionally scoped to a date range. Overlapping ranges for the same shift are blocked — resolve the existing rule before saving a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOverrides ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : shifts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shifts defined yet.</div>
          ) : (
            <div className="space-y-4">
              {shifts.map((s) => (
                <ShiftOverridesGroup
                  key={s.id}
                  shift={s}
                  rules={overridesByShift.get(s.id) ?? []}
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

function ShiftOverridesGroup({
  shift,
  rules,
  global,
  onSaved,
}: {
  shift: Shift;
  rules: Override[];
  global: GlobalSettings;
  onSaved: () => void;
}) {
  const night = isNightShift(shift);
  const [drafts, setDrafts] = useState<Override[]>([]);

  const addDraft = () => {
    setDrafts((d) => [
      ...d,
      {
        shift_id: shift.id,
        grace_minutes: null,
        early_checkin_minutes: null,
        late_checkout_minutes: null,
        enforce_window: null,
        notes: null,
        effective_from: null,
        effective_to: null,
      },
    ]);
  };

  const dismissDraft = (idx: number) =>
    setDrafts((d) => d.filter((_, i) => i !== idx));

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
        <Badge variant={rules.length > 0 ? "default" : "outline"} className="text-[10px]">
          {rules.length === 0 ? "Inherits global" : `${rules.length} custom rule${rules.length > 1 ? "s" : ""}`}
        </Badge>
      </div>

      {rules.length === 0 && drafts.length === 0 && (
        <div className="text-xs text-muted-foreground">No custom rules. Click "Add rule" to create a date-scoped or always-on override.</div>
      )}

      <div className="space-y-3">
        {rules.map((r) => (
          <ShiftOverrideRule
            key={r.id}
            shift={shift}
            rule={r}
            global={global}
            onSaved={onSaved}
          />
        ))}
        {drafts.map((d, i) => (
          <ShiftOverrideRule
            key={`draft-${i}`}
            shift={shift}
            rule={d}
            global={global}
            isDraft
            onCancel={() => dismissDraft(i)}
            onSaved={() => {
              dismissDraft(i);
              onSaved();
            }}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={addDraft} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      </div>
    </div>
  );
}

function ShiftOverrideRule({
  shift,
  rule,
  global,
  onSaved,
  onCancel,
  isDraft = false,
}: {
  shift: Shift;
  rule: Override;
  global: GlobalSettings;
  onSaved: () => void;
  onCancel?: () => void;
  isDraft?: boolean;
}) {
  const [grace, setGrace] = useState<string>(rule.grace_minutes?.toString() ?? "");
  const [early, setEarly] = useState<string>(rule.early_checkin_minutes?.toString() ?? "");
  const [late, setLate] = useState<string>(rule.late_checkout_minutes?.toString() ?? "");
  const [enforce, setEnforce] = useState<"inherit" | "on" | "off">(
    rule.enforce_window === null || rule.enforce_window === undefined
      ? "inherit"
      : rule.enforce_window
        ? "on"
        : "off",
  );
  const [notes, setNotes] = useState<string>(rule.notes ?? "");
  const [from, setFrom] = useState<string>(rule.effective_from ?? "");
  const [to, setTo] = useState<string>(rule.effective_to ?? "");

  const parse = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.min(480, parseInt(s, 10) || 0)));

  const save = useMutation({
    mutationFn: async () => {
      if (from && to && from > to) {
        throw new Error("Effective from cannot be after effective to.");
      }
      const payload = {
        shift_id: shift.id,
        grace_minutes: parse(grace),
        early_checkin_minutes: parse(early),
        late_checkout_minutes: parse(late),
        enforce_window: enforce === "inherit" ? null : enforce === "on",
        notes: notes.trim() || null,
        effective_from: from || null,
        effective_to: to || null,
      };
      if (rule.id) {
        const { error } = await supabase
          .from("shift_attendance_window_overrides")
          .update(payload)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("shift_attendance_window_overrides")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Rule saved for ${shift.name}`);
      onSaved();
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Save failed";
      // Surface the trigger's friendly overlap message verbatim
      toast.error(msg.includes("Overlapping") ? msg : msg);
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!rule.id) return;
      const { error } = await supabase
        .from("shift_attendance_window_overrides")
        .delete()
        .eq("id", rule.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
        <span>
          Effective:{" "}
          <span className="font-mono text-foreground">
            {from || "open start"} → {to || "open end"}
          </span>
        </span>
        {isDraft && <Badge variant="secondary" className="ml-1">Unsaved</Badge>}
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Effective from</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Effective to</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="md:col-span-2 text-[11px] text-muted-foreground self-end pb-2">
          Leave blank for an always-on rule. Date ranges may not overlap with another rule for this shift.
        </div>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Grace (min)</Label>
          <Input type="number" min={0} max={480} placeholder={`Inherit (${global.grace_minutes})`} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Earliest in (min before)</Label>
          <Input type="number" min={0} max={480} placeholder={`Inherit (${global.early_checkin_minutes})`} value={early} onChange={(e) => setEarly(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Latest out (min after)</Label>
          <Input type="number" min={0} max={480} placeholder={`Inherit (${global.late_checkout_minutes})`} value={late} onChange={(e) => setLate(e.target.value)} />
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
        {isDraft ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        ) : (
          rule.id && (
            <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending} className="gap-1.5 text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )
        )}
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving..." : isDraft ? "Save new rule" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
