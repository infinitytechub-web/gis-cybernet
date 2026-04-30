import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Save, Layers, Building2, Shield, Power, PowerOff, History } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLE_OPTIONS = [
  "admin", "supervisor", "staff", "deputy_supervisor", "deputy_shift_leader", "deputy",
  "shift_leader", "special_duties", "front_desk", "oic", "2ic",
  "shift_supervisor", "deputy_shift_supervisor", "official", "enquiry",
  "storekeeper", "procurement_officer", "staff_officer",
  "ipse_supervisor", "ipse_deputy_supervisor",
];

interface OverrideRow {
  id: string;
  scope_type: "role" | "department";
  scope_value: string;
  anchor_date: string;
  pattern: string[];
  enabled: boolean;
  notes: string | null;
  updated_at: string;
}

interface AuditLog {
  id: string;
  changed_at: string;
  changed_by_name: string | null;
  action: string;
  old_anchor_date: string | null;
  new_anchor_date: string | null;
  old_pattern: string[] | null;
  new_pattern: string[] | null;
  changed_fields: string[];
}

function parsePattern(input: string): { ok: true; pattern: string[] } | { ok: false; error: string } {
  const parts = input.split(/[,\\s]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
  if (!parts.length) return { ok: false, error: "Pattern cannot be empty." };
  if (parts.length > 12) return { ok: false, error: "Pattern is limited to 12 entries." };
  for (const p of parts) {
    if (!/^[A-Z]$/.test(p)) return { ok: false, error: `"${p}" is not a single A–Z letter.` };
  }
  return { ok: true, pattern: parts };
}

export function ShiftRotationOverrides() {
  const qc = useQueryClient();

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["shift-rotation-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rotation_overrides" as any)
        .select("id, scope_type, scope_value, anchor_date, pattern, enabled, notes, updated_at")
        .order("scope_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OverrideRow[];
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["shift-rotation-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rotation_config_audit" as any)
        .select("id, changed_at, changed_by_name, action, old_anchor_date, new_anchor_date, old_pattern, new_pattern, changed_fields")
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AuditLog[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("shift-rotation-overrides-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_rotation_overrides" },
        () => qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shift_rotation_config_audit" },
        () => qc.invalidateQueries({ queryKey: ["shift-rotation-audit"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const deptName = useMemo(() => {
    const m = new Map(departments.map((d) => [d.id, d.name]));
    return (id: string) => m.get(id) ?? id;
  }, [departments]);

  const [scopeType, setScopeType] = useState<"role" | "department">("role");
  const [scopeValue, setScopeValue] = useState<string>("");
  const [anchor, setAnchor] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [patternText, setPatternText] = useState<string>("A,B,C,D");
  const [notes, setNotes] = useState<string>("");

  const parsed = parsePattern(patternText);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error((parsed as any).error);
      if (!scopeValue) throw new Error("Choose a scope value.");
      const { error } = await supabase.from("shift_rotation_overrides" as any).insert({
        scope_type: scopeType,
        scope_value: scopeValue,
        anchor_date: anchor,
        pattern: (parsed as any).pattern,
        enabled: true,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override created");
      setScopeValue(""); setNotes(""); setPatternText("A,B,C,D");
      qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create override"),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("shift_rotation_overrides" as any).update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to toggle"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_rotation_overrides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removed");
      qc.invalidateQueries({ queryKey: ["shift-rotation-overrides"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Rotation Overrides — Roles &amp; Departments
          </CardTitle>
          <CardDescription>
            Define a different anchor date and pattern for a specific role or department.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New override
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Scope type</Label>
                <Select value={scopeType} onValueChange={(v) => { setScopeType(v as any); setScopeValue(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role"><Shield className="inline h-3.5 w-3.5 mr-1" /> Role</SelectItem>
                    <SelectItem value="department"><Building2 className="inline h-3.5 w-3.5 mr-1" /> Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{scopeType === "role" ? "Role" : "Department"}</Label>
                <Select value={scopeValue} onValueChange={setScopeValue}>
                  <SelectTrigger><SelectValue placeholder={`Choose ${scopeType}`} /></SelectTrigger>
                  <SelectContent>
                    {scopeType === "role"
                      ? ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)
                      : departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Anchor date</Label>
                <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Pattern</Label>
                <Input
                  value={patternText}
                  onChange={(e) => setPatternText(e.target.value)}
                  placeholder="A,B,C,D"
                  className="font-mono uppercase"
                />
                {!parsed.ok && <p className="text-xs text-destructive">{(parsed as any).error}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. MISD runs a 2-day cycle starting next quarter."
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !parsed.ok || !scopeValue} className="gap-1.5">
                <Save className="h-4 w-4" /> {createMut.isPending ? "Saving…" : "Create override"}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Active overrides ({overrides.length})
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overrides yet.</p>
            ) : (
              <div className="space-y-2">
                {overrides.map((o) => (
                  <div key={o.id} className="rounded-md border bg-card p-3 flex flex-wrap items-center gap-3">
                    <Badge variant="outline" className="gap-1">
                      {o.scope_type === "role" ? <Shield className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      {o.scope_type === "role" ? o.scope_value : deptName(o.scope_value)}
                    </Badge>
                    <div className="text-xs text-muted-foreground">Anchor: <span className="font-mono">{o.anchor_date}</span></div>
                    <div className="flex flex-wrap gap-1">
                      {o.pattern.map((p, i) => <Badge key={i} variant="secondary" className="font-mono text-[10px] px-1.5 py-0">{p}</Badge>)}
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch checked={o.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: o.id, enabled: v })} />
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remove?")) deleteMut.mutate(o.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-medium">{log.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.user_email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(parseISO(log.created_at), "dd MMM HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
