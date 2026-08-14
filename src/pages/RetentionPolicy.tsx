import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock, Play, Loader2, Trash2, ShieldCheck, FileText, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function RetentionPolicy() {
  const { isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [globalDays, setGlobalDays] = useState(365);
  const [deptDays, setDeptDays] = useState(180);
  const [mode, setMode] = useState<"deactivate" | "soft_delete">("deactivate");
  const [dirty, setDirty] = useState(false);

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["app-settings-retention"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "id, announcement_file_retention_enabled, announcement_file_retention_days_global, announcement_file_retention_days_department, announcement_file_cleanup_mode, announcement_file_cleanup_last_run_at",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setEnabled(data.announcement_file_retention_enabled);
        setGlobalDays(data.announcement_file_retention_days_global);
        setDeptDays(data.announcement_file_retention_days_department);
        setMode(data.announcement_file_cleanup_mode as "deactivate" | "soft_delete");
        setDirty(false);
      }
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["announcement-file-cleanup-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcement_file_cleanup_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["announcement-files-stats"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const [total, expiringSoon, withoutExpiry] = await Promise.all([
        supabase.from("announcement_files").select("id", { head: true, count: "exact" }).eq("is_active", true),
        supabase
          .from("announcement_files")
          .select("id", { head: true, count: "exact" })
          .eq("is_active", true)
          .gte("expires_at", now)
          .lte("expires_at", new Date(Date.now() + 7 * 86400_000).toISOString()),
        supabase.from("announcement_files").select("id", { head: true, count: "exact" }).eq("is_active", true).is("expires_at", null),
      ]);
      return {
        active: total.count ?? 0,
        expiringSoon: expiringSoon.count ?? 0,
        noExpiry: withoutExpiry.count ?? 0,
      };
    },
  });

  if (!authLoading && !isAdmin) return <Navigate to="/dashboard" replace />;

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      const { error } = await supabase
        .from("app_settings")
        .update({
          announcement_file_retention_enabled: enabled,
          announcement_file_retention_days_global: globalDays,
          announcement_file_retention_days_department: deptDays,
          announcement_file_cleanup_mode: mode,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings-retention"] });
      toast.success("Retention policy saved");
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cleanup-announcement-files");
      if (error) throw error;
      const r = data as any;
      if (r?.skipped) {
        toast.info("Cleanup skipped — retention is disabled.");
      } else {
        const parts: string[] = [];
        if (r?.defaultApplied) parts.push(`${r.defaultApplied} default policies applied`);
        if (r?.deactivated) parts.push(`${r.deactivated} deactivated`);
        if (r?.softDeleted) parts.push(`${r.softDeleted} soft-deleted`);
        toast.success(parts.length ? `Cleanup complete — ${parts.join(", ")}` : "Cleanup complete — nothing to do");
      }
      qc.invalidateQueries({ queryKey: ["announcement-file-cleanup-runs"] });
      qc.invalidateQueries({ queryKey: ["app-settings-retention"] });
      qc.invalidateQueries({ queryKey: ["announcement-files-stats"] });
    } catch (e: any) {
      toast.error(e.message ?? "Cleanup failed");
    } finally {
      setRunning(false);
    }
  };

  const updateNum = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(1, Math.min(3650, Number(e.target.value) || 1));
    setter(v);
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Announcement File Retention
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure how long shared announcement attachments are kept before auto-cleanup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active shared files</CardDescription>
            <CardTitle className="text-2xl">{stats?.active ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expiring within 7 days</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{stats?.expiringSoon ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active without expiry</CardDescription>
            <CardTitle className="text-2xl">{stats?.noExpiry ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Retention rules
          </CardTitle>
          <CardDescription>
            Files inherit a default expiry based on their audience. Uploaders may override per file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingSettings ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                <div>
                  <Label className="text-sm font-semibold">Auto-cleanup enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, files never expire automatically (existing per-file expiries still apply).
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default retention — All Staff (global)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={3650} value={globalDays} onChange={updateNum(setGlobalDays)} className="w-32" />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default retention — Department-scoped</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={3650} value={deptDays} onChange={updateNum(setDeptDays)} className="w-32" />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Cleanup action when files expire</Label>
                <Select value={mode} onValueChange={(v) => { setMode(v as any); setDirty(true); }}>
                  <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deactivate">Deactivate (hide from staff, keep in storage)</SelectItem>
                    <SelectItem value="soft_delete">Soft delete (move to recycle bin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Schedule</AlertTitle>
                <AlertDescription className="text-xs">
                  Scheduled cleanup runs daily at 03:15 UTC. Last run:{" "}
                  {settings?.announcement_file_cleanup_last_run_at
                    ? format(new Date(settings.announcement_file_cleanup_last_run_at), "dd/MM/yyyy HH:mm:ss")
                    : "never"}
                  .
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Save policy
                </Button>
                <Button variant="outline" onClick={runNow} disabled={running} className="gap-1.5">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run cleanup now
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Recent cleanup runs
          </CardTitle>
          <CardDescription>Last 20 scheduled or manual runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No runs recorded yet.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table style={{ minWidth: 700 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-center">Scanned</TableHead>
                    <TableHead className="text-center">Defaults applied</TableHead>
                    <TableHead className="text-center">Deactivated</TableHead>
                    <TableHead className="text-center">Soft-deleted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{format(new Date(h.started_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{h.trigger_kind}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs">{h.files_scanned}</TableCell>
                      <TableCell className="text-center text-xs">{h.files_with_default_applied}</TableCell>
                      <TableCell className="text-center text-xs">{h.files_deactivated}</TableCell>
                      <TableCell className="text-center text-xs">{h.files_soft_deleted}</TableCell>
                      <TableCell>
                        {h.status === "completed" ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">Completed</Badge>
                        ) : (
                          <Badge variant="destructive" title={h.error_message ?? ""}>Failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
