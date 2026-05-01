import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, DatabaseBackup, Loader2, ShieldAlert, History, Settings2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download-utils";
import { format } from "date-fns";

/**
 * Quick System Backup — admin-only.
 * The actual export is performed by the `system-backup` edge function which:
 *   1) re-verifies the caller's admin role server-side,
 *   2) reads tables under a server allow-list with the service role,
 *   3) writes a row to system_backup_audit for every attempt.
 * The browser only triggers the call and saves the returned JSON.
 */
const BACKUP_TABLES = [
  { name: "profiles", label: "Staff Profiles", critical: true },
  { name: "user_roles", label: "User Roles", critical: true },
  { name: "departments", label: "Departments", critical: true },
  { name: "ranks", label: "Ranks / Designations", critical: true },
  { name: "shifts", label: "Shifts", critical: false },
  { name: "shift_assignments", label: "Shift Assignments", critical: false },
  { name: "attendances", label: "Attendance Records", critical: false },
  { name: "leave_requests", label: "Leave Requests", critical: false },
  { name: "postings_transfers", label: "Postings & Transfers", critical: false },
  { name: "holidays", label: "Holidays", critical: false },
  { name: "announcements", label: "Announcements", critical: false },
  { name: "app_settings", label: "App Settings", critical: true },
] as const;

export function SystemBackup() {
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(BACKUP_TABLES.map((t) => t.name))
  );
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>System backup is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  const toggle = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const runBackup = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one table to back up.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("system-backup", {
        body: { tables: Array.from(selected) },
      });
      if (error) throw error;

      const stamp = format(new Date(), "yyyyMMdd-HHmmss");
      const filename = `cybernet-backup-${stamp}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, filename);
      toast.success(`Backup downloaded: ${filename}`);
    } catch (e: any) {
      const msg = e?.message ?? "Backup failed";
      toast.error(msg.includes("Forbidden") ? "Forbidden — admin role required" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-primary" /> Quick System Backup
          </CardTitle>
          <CardDescription>
            Server-enforced export — every download is admin-checked and recorded in the
            backup audit log below. Files are streamed back to your browser only after the
            server validates your role and table allow-list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BACKUP_TABLES.map((t) => (
              <label
                key={t.name}
                className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent/30 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(t.name)}
                  onCheckedChange={() => toggle(t.name)}
                  disabled={busy}
                />
                <span className="flex-1">{t.label}</span>
                {t.critical && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    core
                  </Badge>
                )}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={runBackup} disabled={busy || selected.size === 0}>
              {busy ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Backing up…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Download Backup</>
              )}
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {selected.size} of {BACKUP_TABLES.length} tables selected
            </span>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              Tip: Store backups in secure, access-controlled storage. The export contains
              personally identifiable information and must be handled per the
              command's data protection policy.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <BackupAuditPanel />
    </div>
  );
}

function BackupAuditPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["system-backup-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_backup_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" /> Backup Audit Log
        </CardTitle>
        <CardDescription>
          Every backup attempt — success, partial, denied, or rejected — recorded by the server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No backup activity yet.</TableCell></TableRow>
              )}
              {(data ?? []).map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(row.created_at), "dd MMM yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-xs">{row.actor_email ?? row.user_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.status === "success"
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : row.status === "partial"
                          ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : "border-destructive/40 text-destructive"
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[260px] truncate" title={(row.tables_exported ?? []).join(", ")}>
                    {(row.tables_exported ?? []).length}/{(row.tables_requested ?? []).length}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{row.total_rows?.toLocaleString() ?? 0}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {row.byte_size ? `${(row.byte_size / 1024).toFixed(1)} KB` : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{row.ip_address ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
