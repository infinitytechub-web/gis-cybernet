import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EyeOff, Info, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logSecurityEvent } from "@/lib/security-audit";
import {
  DEFAULT_STAFF_ID_MASK_RULES,
  STAFF_ID_CONTEXTS,
  STAFF_ID_MASK_MODES,
  applyStaffIdPattern,
  describePattern,
  normalizeStaffIdMaskRules,
  resolveStaffIdPattern,
  type StaffIdContext,
  type StaffIdMaskPattern,
  type StaffIdMaskRules,
} from "@/lib/staff-id-mask";

/** Roles that can be given their own masking pattern. */
const ROLE_CHOICES: { value: string; label: string }[] = [
  { value: "admin", label: "System Administrator" },
  { value: "oic", label: "Officer in Charge (OIC)" },
  { value: "2ic", label: "Second in Command (2IC)" },
  { value: "head_of_administration", label: "Head of Administration" },
  { value: "chief_staff_officer", label: "Chief Staff Officer" },
  { value: "staff_officer", label: "Staff Officer" },
  { value: "command_officer", label: "Command Officer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "shift_leader", label: "Shift Leader" },
  { value: "front_desk", label: "Front Desk" },
  { value: "storekeeper", label: "Storekeeper" },
  { value: "procurement_officer", label: "Procurement Officer" },
  { value: "medical_officer", label: "Medical Officer" },
  { value: "staff", label: "Staff" },
];

const roleLabel = (role: string) => ROLE_CHOICES.find((r) => r.value === role)?.label ?? role;
const contextLabel = (ctx: string) => STAFF_ID_CONTEXTS.find((c) => c.value === ctx)?.label ?? ctx;

const SAMPLE_ID = "GIS-004521";

function PatternEditor({
  value,
  onChange,
}: {
  value: StaffIdMaskPattern;
  onChange: (next: StaffIdMaskPattern) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-52 space-y-1">
        <Label className="text-xs">Mode</Label>
        <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as StaffIdMaskPattern["mode"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ID_MASK_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Leading kept</Label>
        <Input
          type="number" min={0} max={8}
          value={value.head}
          disabled={value.mode !== "partial"}
          onChange={(e) => onChange({ ...value, head: Number(e.target.value) })}
        />
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Trailing kept</Label>
        <Input
          type="number" min={0} max={8}
          value={value.tail}
          disabled={value.mode !== "partial"}
          onChange={(e) => onChange({ ...value, tail: Number(e.target.value) })}
        />
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Mask character</Label>
        <Input
          maxLength={1}
          value={value.char}
          disabled={value.mode !== "partial"}
          onChange={(e) => onChange({ ...value, char: e.target.value || "•" })}
        />
      </div>
      <Badge variant="outline" className="font-mono">{applyStaffIdPattern(SAMPLE_ID, value)}</Badge>
    </div>
  );
}

export function AnonymizationSettings() {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<StaffIdMaskRules>(DEFAULT_STAFF_ID_MASK_RULES);
  const [dirty, setDirty] = useState(false);
  const [newRole, setNewRole] = useState<string>("supervisor");
  const [newContext, setNewContext] = useState<string>("any");

  const { data, isLoading } = useQuery({
    queryKey: ["anonymization-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id, staff_id_mask_rules")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; staff_id_mask_rules: unknown } | null;
    },
  });

  useEffect(() => {
    if (data) {
      setRules(normalizeStaffIdMaskRules(data.staff_id_mask_rules));
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("Settings row not found");
      const payload = normalizeStaffIdMaskRules(rules);
      const { error } = await supabase
        .from("app_settings")
        .update({ staff_id_mask_rules: payload as any })
        .eq("id", data.id);
      if (error) throw error;
      await logSecurityEvent({
        category: "dlp",
        action: "anonymization_rules_updated",
        severity: "warn",
        subject: "staff_id_mask_rules",
        details: {
          full_roles: payload.full_roles,
          default: payload.default,
          role_overrides: Object.keys(payload.role_overrides),
          context_overrides: Object.keys(payload.context_overrides),
        },
      });
    },
    onSuccess: () => {
      toast.success("Anonymisation rules saved");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["anonymization-rules"] });
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the rules"),
  });

  const update = (next: StaffIdMaskRules) => {
    setRules(next);
    setDirty(true);
  };

  const toggleFullRole = (role: string, on: boolean) =>
    update({
      ...rules,
      full_roles: on ? [...new Set([...rules.full_roles, role])] : rules.full_roles.filter((r) => r !== role),
    });

  const addRoleOverride = () => {
    const key = newContext === "any" ? newRole : `${newRole}:${newContext}`;
    if (rules.role_overrides[key]) {
      toast.info("That rule already exists");
      return;
    }
    update({ ...rules, role_overrides: { ...rules.role_overrides, [key]: { ...rules.default } } });
  };

  const removeRoleOverride = (key: string) => {
    const next = { ...rules.role_overrides };
    delete next[key];
    update({ ...rules, role_overrides: next });
  };

  // Live preview: how each role sees a sample identifier in each context.
  const preview = useMemo(
    () =>
      ROLE_CHOICES.map((r) => ({
        role: r,
        cells: STAFF_ID_CONTEXTS.map((c) => {
          const pattern = resolveStaffIdPattern(rules, { role: r.value, context: c.value });
          return { context: c.value as StaffIdContext, rendered: applyStaffIdPattern(SAMPLE_ID, pattern) };
        }),
      })),
    [rules],
  );

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading anonymisation rules…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><EyeOff className="h-5 w-5 text-primary" /> Employee ID anonymisation</CardTitle>
              <CardDescription>
                Control how staff identifiers are shown, by role and by where they appear. Rules apply across
                dashboards, tables, exports and printed sheets.
              </CardDescription>
            </div>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-2">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rules
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Resolution order, most specific first: role + context rule → role rule → full-access role →
              context rule → default. Sample identifier used for previews: <span className="font-mono">{SAMPLE_ID}</span>.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Default pattern</Label>
            <p className="text-xs text-muted-foreground">Applied when no role or context rule matches.</p>
            <PatternEditor value={rules.default} onChange={(p) => update({ ...rules, default: p })} />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Roles that always see full identifiers</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ROLE_CHOICES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={rules.full_roles.includes(r.value)}
                    onCheckedChange={(v) => toggleFullRole(r.value, v === true)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Staff always see their own identifier</p>
                <p className="text-xs text-muted-foreground">Owners are exempt from masking on their own record.</p>
              </div>
              <Switch
                checked={rules.owner_sees_full}
                onCheckedChange={(v) => update({ ...rules, owner_sees_full: v })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Per-context patterns</Label>
            <p className="text-xs text-muted-foreground">
              Applies to everyone who is not covered by a role rule or full access.
            </p>
            {STAFF_ID_CONTEXTS.map((c) => {
              const existing = rules.context_overrides[c.value];
              return (
                <div key={c.value} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <Switch
                      checked={!!existing}
                      onCheckedChange={(on) => {
                        const next = { ...rules.context_overrides };
                        if (on) next[c.value] = { ...rules.default };
                        else delete next[c.value];
                        update({ ...rules, context_overrides: next });
                      }}
                    />
                  </div>
                  {existing && (
                    <PatternEditor
                      value={existing}
                      onChange={(p) => update({ ...rules, context_overrides: { ...rules.context_overrides, [c.value]: p } })}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Per-role patterns</Label>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56 space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_CHOICES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-56 space-y-1">
                <Label className="text-xs">Context</Label>
                <Select value={newContext} onValueChange={setNewContext}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any context</SelectItem>
                    {STAFF_ID_CONTEXTS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={addRoleOverride} className="gap-2"><Plus className="h-4 w-4" /> Add rule</Button>
            </div>

            {Object.keys(rules.role_overrides).length === 0 ? (
              <p className="text-xs text-muted-foreground">No role-specific rules — roles fall back to full access or the context/default pattern.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(rules.role_overrides).map(([key, pattern]) => {
                  const [role, ctx] = key.split(":");
                  return (
                    <div key={key} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {roleLabel(role)}
                          <span className="text-muted-foreground"> · {ctx ? contextLabel(ctx) : "any context"}</span>
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => removeRoleOverride(key)} className="text-destructive gap-1">
                          <Trash2 className="h-4 w-4" /> Remove
                        </Button>
                      </div>
                      <PatternEditor
                        value={pattern}
                        onChange={(p) => update({ ...rules, role_overrides: { ...rules.role_overrides, [key]: p } })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effective view by role</CardTitle>
          <CardDescription>How <span className="font-mono">{SAMPLE_ID}</span> renders for each role, per context.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[700px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  {STAFF_ID_CONTEXTS.map((c) => <TableHead key={c.value}>{c.label}</TableHead>)}
                  <TableHead>Resolved rule</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row) => (
                  <TableRow key={row.role.value}>
                    <TableCell className="text-sm font-medium">{row.role.label}</TableCell>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.context} className="font-mono text-xs">{cell.rendered}</TableCell>
                    ))}
                    <TableCell className="text-xs text-muted-foreground">
                      {describePattern(resolveStaffIdPattern(rules, { role: row.role.value, context: "dashboard" }))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
