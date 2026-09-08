import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roleLabel } from "@/lib/role-labels";
import {
  DIRECTORY_ACTIONS,
  DIRECTORY_ACTION_LABELS,
  DIRECTORY_LEVELS,
  DIRECTORY_LEVEL_LABELS,
  DIRECTORY_SCOPES,
  DIRECTORY_SCOPE_LABELS,
  type DirectoryAction,
  type DirectoryLevel,
  type DirectoryScope,
} from "@/hooks/useDirectoryPermissions";

interface Row {
  id: string;
  role: string;
  level: DirectoryLevel;
  scope: DirectoryScope;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_download: boolean;
  can_print: boolean;
  can_vault: boolean;
}

const FLAG: Record<DirectoryAction, keyof Row> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  download: "can_download",
  print: "can_print",
  vault: "can_vault",
};

const key = (role: string, level: string) => `${role}::${level}`;

export function DirectoryPermissionsMatrix() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["directory-permissions", "matrix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("directory_permissions")
        .select("id, role, level, scope, can_view, can_create, can_edit, can_delete, can_download, can_print, can_vault")
        .order("role")
        .order("level");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const roles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.role))).sort(),
    [rows],
  );

  const byKey = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(key(r.role, r.level), r);
    return m;
  }, [rows]);

  const value = (role: string, level: DirectoryLevel, field: keyof Row) => {
    const k = key(role, level);
    const d = draft[k];
    if (d && field in d) return (d as Record<string, unknown>)[field];
    return byKey.get(k)?.[field];
  };

  const setValue = (role: string, level: DirectoryLevel, field: keyof Row, v: boolean | string) => {
    setDraft((prev) => ({ ...prev, [key(role, level)]: { ...prev[key(role, level)], [field]: v } }));
  };

  const dirtyCount = Object.keys(draft).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(draft).map(([k, patch]) => {
        const row = byKey.get(k);
        if (!row) throw new Error("Unknown permission row");
        return supabase
          .from("directory_permissions")
          .update(patch as never)
          .eq("id", row.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      toast.success("Directory permissions saved");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["directory-permissions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save permissions"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading permission matrix…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Staff Directory permissions
          </CardTitle>
          <CardDescription>
            Independent View, Create, Edit, Delete, Download, Print and Document Vault switches for
            every role at every hierarchy level (HQ → Regional → Sector → Department → Section → Unit → Shift).
            Anything not switched on is denied. Administrators always keep full access.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setDraft({})} className="gap-1">
              <RotateCcw className="h-4 w-4" /> Discard
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1"
            disabled={dirtyCount === 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={DIRECTORY_LEVELS[0]}>
          <TabsList className="flex-wrap h-auto gap-1">
            {DIRECTORY_LEVELS.map((l) => (
              <TabsTrigger key={l} value={l}>
                {DIRECTORY_LEVEL_LABELS[l]}
              </TabsTrigger>
            ))}
          </TabsList>

          {DIRECTORY_LEVELS.map((level) => (
            <TabsContent key={level} value={level} className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">
                Records belonging to <strong>{DIRECTORY_LEVEL_LABELS[level]}</strong>. The scope column
                decides which of those records a role reaches.
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[190px]">Role</TableHead>
                      <TableHead className="min-w-[210px]">Scope</TableHead>
                      {DIRECTORY_ACTIONS.map((a) => (
                        <TableHead key={a} className="text-center">
                          {DIRECTORY_ACTION_LABELS[a]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role}>
                        <TableCell className="font-medium">
                          {roleLabel(role as never)}
                          {role === "admin" && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">always full</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={String(value(role, level, "scope") ?? "none")}
                            onValueChange={(v) => setValue(role, level, "scope", v)}
                            disabled={role === "admin"}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DIRECTORY_SCOPES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {DIRECTORY_SCOPE_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {DIRECTORY_ACTIONS.map((a) => (
                          <TableCell key={a} className="text-center">
                            <Switch
                              checked={role === "admin" ? true : !!value(role, level, FLAG[a])}
                              disabled={role === "admin"}
                              onCheckedChange={(v) => setValue(role, level, FLAG[a], v)}
                              aria-label={`${DIRECTORY_ACTION_LABELS[a]} for ${role} at ${level}`}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default DirectoryPermissionsMatrix;
