import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RotateCcw, Shield, ShieldAlert, KeyRound, PowerOff, Power, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "oic" | "2ic" | "staff_officer" | "supervisor";
type Action = "disconnect" | "reconnect" | "purge" | "export";

const ROLES: { id: Role; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "oic", label: "Command OIC" },
  { id: "2ic", label: "2IC" },
  { id: "staff_officer", label: "Staff Officer" },
  { id: "supervisor", label: "Supervisor" },
];

const ACTIONS: { id: Action; label: string; description: string; Icon: any }[] = [
  { id: "disconnect", label: "Disconnect", description: "Disable a staff platform link", Icon: PowerOff },
  { id: "reconnect", label: "Reconnect", description: "Re-enable a staff platform link", Icon: Power },
  { id: "purge", label: "Purge all", description: "Delete every connection record", Icon: Trash2 },
  { id: "export", label: "Export", description: "Download CSV / JSON data", Icon: Download },
];

interface PermRow {
  id: string;
  role: Role;
  action: Action;
  allowed: boolean;
}

const matrixKey = (role: Role, action: Action) => `${role}::${action}`;

export function ShiftConnectionPermissionsMatrix() {
  const qc = useQueryClient();
  const { isAdmin } = useAuthContext();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["shift-connection-permissions-matrix"],
    queryFn: async (): Promise<PermRow[]> => {
      const { data, error } = await supabase
        .from("shift_connection_permissions" as any)
        .select("id, role, action, allowed");
      if (error) throw error;
      return ((data ?? []) as unknown) as PermRow[];
    },
  });

  const initial = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of ROLES) {
      for (const a of ACTIONS) {
        m[matrixKey(r.id, a.id)] = r.id === "admin"; // default
      }
    }
    for (const row of rows) m[matrixKey(row.role, row.action)] = !!row.allowed;
    return m;
  }, [rows]);

  // Sync draft when server state loads/changes
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const dirty = useMemo(
    () => Object.keys(initial).some((k) => initial[k] !== draft[k]),
    [initial, draft],
  );

  const handleToggle = (role: Role, action: Action, value: boolean) => {
    if (role === "admin") return; // admin always allowed
    setDraft((d) => ({ ...d, [matrixKey(role, action)]: value }));
  };

  const handleReset = () => {
    setDraft(initial);
  };

  const handleResetDefaults = () => {
    const m: Record<string, boolean> = {};
    for (const r of ROLES) {
      for (const a of ACTIONS) {
        m[matrixKey(r.id, a.id)] = r.id === "admin";
      }
    }
    setDraft(m);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const upserts = ROLES.flatMap((r) =>
        ACTIONS.map((a) => ({
          role: r.id,
          action: a.id,
          allowed: r.id === "admin" ? true : !!draft[matrixKey(r.id, a.id)],
        })),
      );
      const { error } = await supabase
        .from("shift_connection_permissions" as any)
        .upsert(upserts, { onConflict: "role,action" });
      if (error) throw error;
      toast.success("Shift connection permissions updated.");
      await refetch();
      qc.invalidateQueries({ queryKey: ["shift-connection-permissions"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save permissions.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" /> Shift Connection Permissions
            </CardTitle>
            <CardDescription>
              Choose which admin-tier roles may disconnect, reconnect, purge, or export shift
              platform device connections. Admin always has full access.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetDefaults}
              disabled={isSaving || !isAdmin}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset} disabled={!dirty || isSaving}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving || !isAdmin} className="gap-1.5">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isAdmin && (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
            <span>Read-only — only admins can modify the permissions matrix.</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading matrix…
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Action</TableHead>
                  {ROLES.map((r) => (
                    <TableHead key={r.id} className="text-center text-[11px] min-w-[110px]">
                      {r.label}
                      {r.id === "admin" && (
                        <Badge variant="secondary" className="ml-1 text-[9px] gap-1">
                          <Shield className="h-2.5 w-2.5" /> always
                        </Badge>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACTIONS.map(({ id, label, description, Icon }) => (
                  <TableRow key={id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Icon className="h-4 w-4 text-primary mt-0.5" />
                        <div>
                          <div className="text-xs font-medium">{label}</div>
                          <div className="text-[11px] text-muted-foreground">{description}</div>
                        </div>
                      </div>
                    </TableCell>
                    {ROLES.map((r) => {
                      const k = matrixKey(r.id, id);
                      const value = r.id === "admin" ? true : !!draft[k];
                      const locked = r.id === "admin" || !isAdmin;
                      return (
                        <TableCell key={r.id} className="text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={value}
                              disabled={locked || isSaving}
                              onCheckedChange={(v) => handleToggle(r.id, id, v)}
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground">
          Changes apply to every Shift Connections audit drawer immediately after saving. Database
          policies still enforce that only admins can run the destructive purge RPC; other roles can
          only perform the specific actions toggled on here.
        </div>
      </CardContent>
    </Card>
  );
}
