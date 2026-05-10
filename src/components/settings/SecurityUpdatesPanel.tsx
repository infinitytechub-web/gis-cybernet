import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert, ShieldX, Play, Loader2, Clock, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { runRepoHygieneScan } from "@/lib/security-dependency-scan";
import { exportRunAsCsv, exportRunAsPdf, type ExportRun } from "@/lib/security-scan-export";

type Severity = "info" | "warn" | "error";
interface Finding {
  check: string;
  severity: Severity;
  title: string;
  detail?: string;
}

const sevBadge = (s: Severity) => {
  if (s === "error") return <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" /> Error</Badge>;
  if (s === "warn") return <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400"><ShieldAlert className="h-3 w-3" /> Warning</Badge>;
  return <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3 w-3" /> Info</Badge>;
};

export function SecurityUpdatesPanel() {
  const qc = useQueryClient();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["security-scan-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id, security_scan_enabled, security_scan_frequency, security_scan_last_run_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["security-scan-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_scan_runs")
        .select("id, trigger_kind, status, total_checks, passed_count, warn_count, error_count, started_at, finished_at, findings")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as ExportRun[];
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<{ security_scan_enabled: boolean; security_scan_frequency: string }>) => {
      if (!settings?.id) return;
      const { error } = await supabase.from("app_settings").update(patch).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["security-scan-settings"] });
      toast.success("Security scan settings updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runScan = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const startedAt = new Date().toISOString();

      const { data, error } = await supabase.rpc("run_security_hygiene_scan");
      if (error) throw error;
      const dbFindings = (data ?? []) as unknown as Finding[];

      // Client-side repo / dependency hygiene
      const repoFindings = runRepoHygieneScan() as Finding[];
      const list: Finding[] = [...dbFindings, ...repoFindings];

      const errs = list.filter((f) => f.severity === "error").length;
      const warns = list.filter((f) => f.severity === "warn").length;
      const infos = list.filter((f) => f.severity === "info").length;

      const { data: inserted, error: insErr } = await supabase
        .from("security_scan_runs")
        .insert({
          triggered_by: user.id,
          trigger_kind: "manual",
          status: "completed",
          total_checks: list.length,
          passed_count: infos,
          warn_count: warns,
          error_count: errs,
          findings: list as any,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (settings?.id) {
        await supabase
          .from("app_settings")
          .update({ security_scan_last_run_at: new Date().toISOString() })
          .eq("id", settings.id);
      }
      return { list, runId: inserted?.id as string };
    },
    onSuccess: ({ list, runId }) => {
      setFindings(list);
      setLatestRunId(runId);
      qc.invalidateQueries({ queryKey: ["security-scan-runs"] });
      qc.invalidateQueries({ queryKey: ["security-scan-settings"] });
      const errs = list.filter((f) => f.severity === "error").length;
      if (errs > 0) toast.error(`${errs} critical issue${errs === 1 ? "" : "s"} found`);
      else toast.success("Security scan complete");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buildLatestRun = (): ExportRun | null => {
    if (!findings) return null;
    const fromHistory = latestRunId ? history.find((h) => h.id === latestRunId) : null;
    return {
      id: fromHistory?.id ?? "latest",
      trigger_kind: fromHistory?.trigger_kind ?? "manual",
      status: fromHistory?.status ?? "completed",
      total_checks: findings.length,
      passed_count: findings.filter((f) => f.severity === "info").length,
      warn_count: findings.filter((f) => f.severity === "warn").length,
      error_count: findings.filter((f) => f.severity === "error").length,
      started_at: fromHistory?.started_at ?? new Date().toISOString(),
      finished_at: fromHistory?.finished_at ?? new Date().toISOString(),
      findings,
    };
  };

  const handleExportRun = async (run: ExportRun, kind: "csv" | "pdf") => {
    let full = run;
    if (!run.findings || run.findings.length === 0) {
      const { data } = await supabase
        .from("security_scan_runs")
        .select("id, trigger_kind, status, total_checks, passed_count, warn_count, error_count, started_at, finished_at, findings")
        .eq("id", run.id)
        .maybeSingle();
      if (data) full = data as unknown as ExportRun;
    }
    if (kind === "csv") exportRunAsCsv(full, history);
    else exportRunAsPdf(full, history);
    toast.success(`Exported ${kind.toUpperCase()} report`);
  };

  const errCount = findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnCount = findings?.filter((f) => f.severity === "warn").length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> Security Updates &amp; Scans
          </CardTitle>
          <CardDescription>
            Run on-demand security audits across database tables, RLS policies, SECURITY DEFINER
            functions and outdated/vulnerable npm dependencies — or schedule them to run automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <Button
              onClick={() => runScan.mutate()}
              disabled={runScan.isPending}
              className="gap-2"
            >
              {runScan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run security scan now
            </Button>
            {settings?.security_scan_last_run_at && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last run: {format(new Date(settings.security_scan_last_run_at), "PPpp")}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-semibold">Automatic security scans</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the system runs the same checks on a schedule and records results below.
                </p>
              </div>
              <Switch
                checked={!!settings?.security_scan_enabled}
                onCheckedChange={(v) => updateSettings.mutate({ security_scan_enabled: v })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm w-24">Frequency</Label>
              <Select
                value={settings?.security_scan_frequency ?? "weekly"}
                onValueChange={(v) => updateSettings.mutate({ security_scan_frequency: v })}
                disabled={!settings?.security_scan_enabled}
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {findings && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Latest scan results</CardTitle>
              <CardDescription>
                {findings.length} check{findings.length === 1 ? "" : "s"} executed —{" "}
                <span className="text-destructive font-medium">{errCount} error{errCount === 1 ? "" : "s"}</span>,{" "}
                <span className="text-amber-600 font-medium">{warnCount} warning{warnCount === 1 ? "" : "s"}</span>.
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  const r = buildLatestRun();
                  if (r) handleExportRun(r, "csv");
                }}
              >
                <FileDown className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  const r = buildLatestRun();
                  if (r) handleExportRun(r, "pdf");
                }}
              >
                <FileText className="h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {errCount === 0 && warnCount === 0 ? (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>All clear</AlertTitle>
                <AlertDescription>No errors or warnings detected.</AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Severity</TableHead>
                      <TableHead>Finding</TableHead>
                      <TableHead className="hidden md:table-cell">Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell>{sevBadge(f.severity)}</TableCell>
                        <TableCell className="font-medium">{f.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {f.detail}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent scans</CardTitle>
          <CardDescription>Last 10 manual or automatic security scans.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No scans recorded yet.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-center">Checks</TableHead>
                    <TableHead className="text-center">Errors</TableHead>
                    <TableHead className="text-center">Warnings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Export</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{format(new Date(h.started_at), "PPp")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{h.trigger_kind}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{h.total_checks}</TableCell>
                      <TableCell className="text-center">
                        {h.error_count > 0 ? (
                          <Badge variant="destructive">{h.error_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {h.warn_count > 0 ? (
                          <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">
                            {h.warn_count}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{h.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1"
                            onClick={() => handleExportRun(h, "csv")}
                          >
                            <FileDown className="h-3.5 w-3.5" /> CSV
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1"
                            onClick={() => handleExportRun(h, "pdf")}
                          >
                            <FileText className="h-3.5 w-3.5" /> PDF
                          </Button>
                        </div>
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

export default SecurityUpdatesPanel;
