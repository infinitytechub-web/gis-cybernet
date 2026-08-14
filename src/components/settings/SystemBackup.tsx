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
import { Download, DatabaseBackup, Loader2, ShieldAlert, History, Settings2, Trash2, Archive, Upload, RotateCcw, FileJson, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download-utils";
import { format } from "date-fns";
import { BackupSchedulesPanel } from "./BackupSchedulesPanel";

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

      <BackupSchedulesPanel />
      <BackupRetentionSettings />
      <BackupSnapshotsPanel />
      <BackupAuditPanel />
    </div>
  );
}

function BackupRetentionSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["system-backup-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_backup_settings")
        .select("*")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [retentionCount, setRetentionCount] = useState<number>(50);
  const [retentionDays, setRetentionDays] = useState<string>("");
  const [cleanupEnabled, setCleanupEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [pruning, setPruning] = useState(false);

  useEffect(() => {
    if (settings) {
      setRetentionCount(settings.retention_count ?? 50);
      setRetentionDays(settings.retention_days ? String(settings.retention_days) : "");
      setCleanupEnabled(settings.cleanup_enabled ?? true);
    }
  }, [settings]);

  const save = async () => {
    if (!settings) return;
    if (retentionCount < 1 || retentionCount > 1000) {
      toast.error("Retention count must be between 1 and 1000.");
      return;
    }
    const days = retentionDays.trim() === "" ? null : Number(retentionDays);
    if (days !== null && (Number.isNaN(days) || days < 1 || days > 3650)) {
      toast.error("Retention days must be between 1 and 3650 (or empty).");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("system_backup_settings")
      .update({
        retention_count: retentionCount,
        retention_days: days,
        cleanup_enabled: cleanupEnabled,
      })
      .eq("singleton", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Retention settings saved.");
    queryClient.invalidateQueries({ queryKey: ["system-backup-settings"] });
  };

  const runCleanup = async () => {
    setPruning(true);
    try {
      const { data, error } = await supabase.functions.invoke("system-backup-cleanup", {
        body: {},
      });
      if (error) throw error;
      const deleted = data?.result?.deleted ?? 0;
      toast.success(deleted > 0 ? `Pruned ${deleted} old audit row(s).` : "Nothing to prune.");
      queryClient.invalidateQueries({ queryKey: ["system-backup-audit"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Cleanup failed");
    } finally {
      setPruning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" /> Backup Retention
        </CardTitle>
        <CardDescription>
          Control how many backup audit entries to keep. Cleanup runs automatically after every
          export, and can be triggered manually below. Cleanup events are themselves recorded in
          the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-count">Keep last N exports</Label>
                <Input
                  id="ret-count"
                  type="number"
                  min={1}
                  max={1000}
                  value={retentionCount}
                  onChange={(e) => setRetentionCount(Number(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">1–1000. Default: 50.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-days">Also delete after (days)</Label>
                <Input
                  id="ret-days"
                  type="number"
                  min={1}
                  max={3650}
                  placeholder="Optional"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Leave blank to disable age-based pruning.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-enabled">Cleanup enabled</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch id="ret-enabled" checked={cleanupEnabled} onCheckedChange={setCleanupEnabled} />
                  <span className="text-xs text-muted-foreground">
                    {cleanupEnabled ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Denied and rejected attempts are <strong>never pruned</strong> — they are kept
                permanently as a security signal.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Settings
              </Button>
              <Button variant="outline" onClick={runCleanup} disabled={pruning}>
                {pruning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Run Cleanup Now
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
                <TableHead>When (exact)</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No backup activity yet.</TableCell></TableRow>
              )}
              {(data ?? []).map((row: any) => {
                const resultLabel = row.status === "denied" || row.status === "rejected"
                  ? "denied"
                  : row.status === "success" || row.status === "partial"
                  ? "allowed"
                  : row.status === "cleanup"
                  ? "system"
                  : "error";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs font-mono whitespace-nowrap" title={row.created_at}>
                      {format(new Date(row.created_at), "dd MMM yyyy HH:mm:ss.SSS")}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{row.actor_email ?? (row.user_id ? row.user_id.slice(0, 8) : "system")}</div>
                      {row.user_id && <div className="text-[10px] text-muted-foreground font-mono">{row.user_id.slice(0, 12)}…</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        resultLabel === "allowed" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : resultLabel === "denied" ? "border-destructive/40 text-destructive"
                        : resultLabel === "system" ? "border-sky-500/40 text-sky-700 dark:text-sky-300"
                        : "border-amber-500/40 text-amber-700 dark:text-amber-300"
                      }>
                        {resultLabel} · {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate" title={(row.tables_exported ?? []).join(", ")}>
                      {(row.tables_exported ?? []).length}/{(row.tables_requested ?? []).length}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{row.total_rows?.toLocaleString() ?? 0}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{row.byte_size ? `${(row.byte_size / 1024).toFixed(1)} KB` : "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{row.ip_address ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Download JSON" onClick={() => {
                          const blob = new Blob([JSON.stringify(row, null, 2)], { type: "application/json" });
                          downloadBlob(blob, `backup-audit-${row.id}.json`);
                        }}>
                          <FileJson className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Download text log" onClick={() => {
                          const blob = new Blob([buildAuditTextLog(row)], { type: "text/plain" });
                          downloadBlob(blob, `backup-audit-${row.id}.txt`);
                        }}>
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const RESTORABLE_TABLES = [
  "profiles", "user_roles", "departments", "ranks", "shifts",
  "shift_assignments", "attendances", "leave_requests",
  "postings_transfers", "holidays", "announcements", "app_settings",
];

function BackupSnapshotsPanel() {
  const queryClient = useQueryClient();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [activeSnapshot, setActiveSnapshot] = useState<any | null>(null);
  const [uploadPayload, setUploadPayload] = useState<any | null>(null);
  const [uploadName, setUploadName] = useState<string>("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["system-backup-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_backup_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const openRestoreFromSnapshot = (snap: any) => {
    setActiveSnapshot(snap);
    setUploadPayload(null);
    setUploadName("");
    const tables = (snap.tables_included ?? []) as string[];
    setSelectedTables(new Set(tables.filter((t) => RESTORABLE_TABLES.includes(t))));
    setRestoreOpen(true);
  };

  const handleUpload = async (file: File) => {
    try {
      const lower = file.name.toLowerCase();
      // Friendly rejection for formats the upsert-by-PK restore path can't safely consume
      if (lower.endsWith(".sql") || lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".zip")) {
        toast.error(`${lower.split(".").pop()?.toUpperCase()} restore is not supported — please upload a .json or .json.gz backup.`);
        return;
      }
      let text: string;
      if (lower.endsWith(".gz")) {
        // Browser-native gzip decode
        const ds = new DecompressionStream("gzip");
        const stream = file.stream().pipeThrough(ds);
        text = await new Response(stream).text();
      } else if (lower.endsWith(".json")) {
        text = await file.text();
      } else {
        toast.error("Unsupported file type. Upload a .json or .json.gz backup.");
        return;
      }
      const json = JSON.parse(text);
      const meta = json?._meta;
      const tables: string[] = Array.isArray(meta?.tables) ? meta.tables : Object.keys(json).filter((k) => k !== "_meta");
      setUploadPayload(json);
      setUploadName(file.name);
      setActiveSnapshot(null);
      setSelectedTables(new Set(tables.filter((t) => RESTORABLE_TABLES.includes(t))));
      setRestoreOpen(true);
    } catch (e: any) {
      toast.error(`Invalid backup file: ${e.message}`);
    }
  };

  const downloadSnapshot = async (snap: any) => {
    const { data, error } = await supabase.storage
      .from("system-backups")
      .download(snap.storage_path);
    if (error || !data) {
      toast.error(`Download failed: ${error?.message}`);
      return;
    }
    downloadBlob(data, snap.file_name);
  };

  const runRestore = async () => {
    if (selectedTables.size === 0) {
      toast.error("Select at least one table to restore.");
      return;
    }
    setRestoring(true);
    try {
      const body: Record<string, unknown> = { tables: Array.from(selectedTables) };
      if (activeSnapshot) body.snapshot_id = activeSnapshot.id;
      else if (uploadPayload) {
        body.snapshot_payload = uploadPayload;
        body.source_label = `upload:${uploadName}`;
      } else {
        toast.error("No source selected.");
        setRestoring(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("system-backup-restore", { body });
      if (error) throw error;
      const total = data?.total ?? 0;
      const restored = data?.restored?.length ?? 0;
      if (data?.status === "success") toast.success(`Restored ${restored} table(s), ${total} row(s).`);
      else if (data?.status === "partial") toast.warning(`Partial restore: ${restored} table(s), ${total} row(s).`);
      else toast.error(`Restore failed: ${data?.errors?.join("; ") ?? "unknown"}`);
      setRestoreOpen(false);
      queryClient.invalidateQueries({ queryKey: ["system-backup-restore-audit"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-primary" /> Snapshot Library &amp; Safe Restore
        </CardTitle>
        <CardDescription>
          Every backup is automatically archived to private storage. Choose a snapshot below to
          restore selected tables (upsert by primary key — existing rows are merged, nothing is
          deleted), or upload a previously downloaded backup file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-accent/30">
            <Upload className="h-4 w-4" />
            Upload backup file…
            <input
              type="file"
              accept=".json,.gz,application/json,application/gzip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground ml-auto">{snapshots.length} archived snapshot(s)</span>
        </div>

        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && snapshots.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No snapshots archived yet. Run a backup to create one.</TableCell></TableRow>
              )}
              {snapshots.map((snap: any) => (
                <TableRow key={snap.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(snap.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{snap.source}</Badge></TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-[220px]" title={snap.file_name}>{snap.file_name}</TableCell>
                  <TableCell className="text-xs">{(snap.tables_included ?? []).length}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{snap.total_rows?.toLocaleString() ?? 0}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{((snap.byte_size ?? 0) / 1024).toFixed(1)} KB</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadSnapshot(snap)} title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openRestoreFromSnapshot(snap)} title="Restore">
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> Restore from backup</DialogTitle>
            <DialogDescription>
              Source: <span className="font-mono">{activeSnapshot ? activeSnapshot.file_name : uploadName || "(uploaded file)"}</span>
              <br />
              Restore performs an <strong>upsert by primary key</strong>. Existing rows are merged
              with backup values; rows added since the backup are <strong>not</strong> deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {RESTORABLE_TABLES.map((t) => {
              const inSnapshot = activeSnapshot
                ? (activeSnapshot.tables_included ?? []).includes(t)
                : uploadPayload && Object.prototype.hasOwnProperty.call(uploadPayload, t);
              return (
                <label key={t} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${inSnapshot ? "" : "opacity-50"}`}>
                  <Checkbox
                    checked={selectedTables.has(t)}
                    disabled={!inSnapshot}
                    onCheckedChange={() => {
                      const next = new Set(selectedTables);
                      next.has(t) ? next.delete(t) : next.add(t);
                      setSelectedTables(next);
                    }}
                  />
                  <span className="flex-1 font-mono">{t}</span>
                  {!inSnapshot && <span className="text-[10px] text-muted-foreground">not in backup</span>}
                </label>
              );
            })}
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              Selected: <strong>{selectedTables.size}</strong> table(s). This action is recorded in the restore audit log.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoreOpen(false)} disabled={restoring}>Cancel</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={restoring || selectedTables.size === 0}>
                  {restoring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Restore
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restore {selectedTables.size} table(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Existing rows with matching primary keys will be overwritten with values from
                    the backup. Rows that exist now but were not in the backup remain untouched.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runRestore}>Yes, restore</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function buildAuditTextLog(row: any): string {
  const lines = [
    `=== System Backup Audit Entry ===`,
    `id:           ${row.id}`,
    `created_at:   ${row.created_at}`,
    `actor_email:  ${row.actor_email ?? "(system)"}`,
    `user_id:      ${row.user_id ?? "(system)"}`,
    `status:       ${row.status}`,
    `ip_address:   ${row.ip_address ?? "—"}`,
    `user_agent:   ${row.user_agent ?? "—"}`,
    `total_rows:   ${row.total_rows ?? 0}`,
    `byte_size:    ${row.byte_size ?? 0}`,
    `tables_requested: ${(row.tables_requested ?? []).join(", ") || "—"}`,
    `tables_exported:  ${(row.tables_exported ?? []).join(", ") || "—"}`,
    `row_counts:`,
    JSON.stringify(row.row_counts ?? {}, null, 2),
    `error_message:`,
    row.error_message ?? "(none)",
    ``,
    `Server log reference: Lovable Cloud → Functions → system-backup → search "${row.id}"`,
  ];
  return lines.join("\n");
}
