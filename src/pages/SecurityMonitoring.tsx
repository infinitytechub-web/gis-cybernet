import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck, UserCog, KeyRound, FileWarning, Download, Radio } from "lucide-react";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCell } from "@/lib/csv-safe";
import { SecurityHero } from "@/components/security/SecurityHero";
import { SecurityWebhooksCard } from "@/components/security/SecurityWebhooksCard";
import { useSecurityAlertStream } from "@/hooks/useSecurityAlertStream";

type Settings = {
  id: string;
  enabled: boolean;
  email_alerts: boolean;
  role_change_window_minutes: number;
  role_change_threshold: number;
  authz_failure_window_minutes: number;
  authz_failure_threshold: number;
  upload_access_window_minutes: number;
  upload_access_threshold: number;
  last_run_at: string | null;
};

type Alert = {
  id: string;
  rule_key: string;
  severity: string;
  subject_label: string | null;
  event_count: number;
  threshold: number;
  window_start: string;
  window_end: string;
  details: any;
  acknowledged_at: string | null;
  acknowledge_note: string | null;
  created_at: string;
};

const RULES: Record<string, { label: string; icon: typeof UserCog }> = {
  role_change_burst: { label: "Suspicious role changes", icon: UserCog },
  authorization_failure_burst: { label: "Authorization failures", icon: KeyRound },
  upload_access_anomaly: { label: "Unusual upload / file access", icon: FileWarning },
};

const fmtDateTime = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const severityVariant = (s: string): "destructive" | "default" | "secondary" =>
  s === "critical" ? "destructive" : s === "high" ? "default" : "secondary";

export default function SecurityMonitoring() {
  usePageMeta({
    title: "Security Monitoring & Alerting",
    description: "Detect suspicious role changes, authorization failures and unusual file-access patterns.",
  });
  const { isAdmin, isOic, is2ic } = useAuth();
  const allowed = isAdmin || isOic || is2ic;
  const queryClient = useQueryClient();

  const [ruleFilter, setRuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [ackTarget, setAckTarget] = useState<Alert | null>(null);
  const [ackNote, setAckNote] = useState("");

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["security-monitor-settings"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_monitor_settings" as any)
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Settings | null;
    },
  });

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ["security-monitor-alerts"],
    enabled: allowed,
    refetchInterval: live ? false : 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_monitor_alerts" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Alert[];
    },
  });

  const { live, setLive, connected, lastEventAt } = useSecurityAlertStream({
    enabled: allowed,
    onAlert: (a: any) => {
      const label = RULES[a?.rule_key]?.label ?? a?.rule_key ?? "Security alert";
      const severity = String(a?.severity ?? "").toUpperCase();
      toast.warning(`${severity}: ${label}`, { description: a?.subject_label ?? undefined });
    },
  });

  const current = useMemo<Settings | null>(
    () => (settings ? ({ ...settings, ...draft } as Settings) : null),
    [settings, draft],
  );

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!settings) throw new Error("Settings not loaded");
      const { error } = await supabase
        .from("security_monitor_settings" as any)
        .update(patch as any)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({});
      toast.success("Monitoring thresholds saved");
      queryClient.invalidateQueries({ queryKey: ["security-monitor-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save settings"),
  });

  const runScan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("security_monitor_scan" as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      const n = Number(data?.alerts_created ?? 0);
      toast.success(n > 0 ? `${n} new alert(s) raised` : "Scan complete — nothing suspicious");
      queryClient.invalidateQueries({ queryKey: ["security-monitor-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["security-monitor-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  const acknowledge = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.rpc("security_monitor_acknowledge" as any, {
        _alert_id: id,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert acknowledged");
      setAckTarget(null);
      setAckNote("");
      queryClient.invalidateQueries({ queryKey: ["security-monitor-alerts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not acknowledge alert"),
  });

  const filtered = useMemo(
    () =>
      alerts.filter((a) => {
        if (ruleFilter !== "all" && a.rule_key !== ruleFilter) return false;
        if (statusFilter === "open" && a.acknowledged_at) return false;
        if (statusFilter === "acknowledged" && !a.acknowledged_at) return false;
        return true;
      }),
    [alerts, ruleFilter, statusFilter],
  );

  const counts = useMemo(() => {
    const open = alerts.filter((a) => !a.acknowledged_at);
    return {
      open: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      roles: open.filter((a) => a.rule_key === "role_change_burst").length,
      authz: open.filter((a) => a.rule_key === "authorization_failure_burst").length,
      uploads: open.filter((a) => a.rule_key === "upload_access_anomaly").length,
    };
  }, [alerts]);

  const exportCsv = () => {
    const header = ["Raised", "Severity", "Rule", "Subject", "Events", "Threshold", "Window start", "Window end", "Status", "Note"];
    const lines = [header.join(",")].concat(
      filtered.map((a) =>
        [
          csvCell(fmtDateTime(a.created_at)),
          csvCell(a.severity),
          csvCell(RULES[a.rule_key]?.label ?? a.rule_key),
          csvCell(a.subject_label ?? ""),
          csvCell(a.event_count),
          csvCell(a.threshold),
          csvCell(fmtDateTime(a.window_start)),
          csvCell(fmtDateTime(a.window_end)),
          csvCell(a.acknowledged_at ? "Acknowledged" : "Open"),
          csvCell(a.acknowledge_note ?? ""),
        ].join(","),
      ),
    );
    downloadCSVString(lines.join("\n"), `security-monitor-alerts-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  const dirty = Object.keys(draft).length > 0;
  const numberField = (
    key: keyof Settings,
    label: string,
    hint: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(key)}>{label}</Label>
      <Input
        id={String(key)}
        type="number"
        min={1}
        disabled={!isAdmin}
        value={String((current as any)?.[key] ?? "")}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: Math.max(1, Number(e.target.value) || 1) }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <SecurityHero
        icon={ShieldAlert}
        title="Security Monitoring & Alerting"
        subtitle="Threshold-based detection of suspicious role changes, authorization failures and unusual upload access."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open alerts", value: counts.open, icon: ShieldAlert },
          { label: "Role-change alerts", value: counts.roles, icon: UserCog },
          { label: "Authorization alerts", value: counts.authz, icon: KeyRound },
          { label: "Upload-access alerts", value: counts.uploads, icon: FileWarning },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold">{k.value}</p>
              </div>
              <k.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Detection rules</CardTitle>
            <CardDescription>
              Last scan: {fmtDateTime(settings?.last_run_at)} · scans also run automatically in the background.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run scan now
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingSettings ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="monitor-enabled"
                    checked={!!current?.enabled}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
                  />
                  <Label htmlFor="monitor-enabled">Monitoring enabled</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="monitor-email"
                    checked={!!current?.email_alerts}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, email_alerts: v }))}
                  />
                  <Label htmlFor="monitor-email">Email digest to administrators</Label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-4 rounded-md border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium"><UserCog className="h-4 w-4" /> Role changes</p>
                  {numberField("role_change_threshold", "Alert after", "Role grants/revocations by one officer.")}
                  {numberField("role_change_window_minutes", "Within (minutes)", "Rolling detection window.")}
                </div>
                <div className="space-y-4 rounded-md border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> Authorization failures</p>
                  {numberField("authz_failure_threshold", "Alert after", "Denied / unauthorized attempts per actor.")}
                  {numberField("authz_failure_window_minutes", "Within (minutes)", "Rolling detection window.")}
                </div>
                <div className="space-y-4 rounded-md border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium"><FileWarning className="h-4 w-4" /> Upload / file access</p>
                  {numberField("upload_access_threshold", "Alert after", "File downloads, previews and uploads per actor.")}
                  {numberField("upload_access_window_minutes", "Within (minutes)", "Rolling detection window.")}
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-2">
                  <Button onClick={() => saveSettings.mutate(draft)} disabled={!dirty || saveSettings.isPending}>
                    {saveSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Save thresholds
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft({})} disabled={!dirty}>Reset</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SecurityWebhooksCard canEdit={isAdmin} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Alerts</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Radio
                className={`h-3.5 w-3.5 ${live && connected ? "animate-pulse text-primary" : "text-muted-foreground"}`}
                aria-hidden
              />
              {live
                ? connected
                  ? `Live — streaming new alerts${lastEventAt ? ` · last update ${fmtDateTime(lastEventAt)}` : ""}`
                  : "Live — connecting…"
                : "Live mode off — list refreshes every minute"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-1">
              <Switch id="live-mode" checked={live} onCheckedChange={setLive} />
              <Label htmlFor="live-mode" className="text-xs">Real-time</Label>
            </div>
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Rule" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {Object.entries(RULES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Raised</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAlerts ? (
                  <TableRow><TableCell colSpan={8}><Loader2 className="h-4 w-4 animate-spin" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      No alerts for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(a.created_at)}</TableCell>
                      <TableCell><Badge variant={severityVariant(a.severity)}>{a.severity}</Badge></TableCell>
                      <TableCell>{RULES[a.rule_key]?.label ?? a.rule_key}</TableCell>
                      <TableCell>{a.subject_label ?? "—"}</TableCell>
                      <TableCell>{a.event_count} / {a.threshold}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDateTime(a.window_start)} → {fmtDateTime(a.window_end)}
                      </TableCell>
                      <TableCell>
                        {a.acknowledged_at ? (
                          <Badge variant="secondary">Acknowledged</Badge>
                        ) : (
                          <Badge variant="outline">Open</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!a.acknowledged_at && (
                          <Button size="sm" variant="outline" onClick={() => { setAckTarget(a); setAckNote(""); }}>
                            Acknowledge
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!ackTarget} onOpenChange={(o) => !o && setAckTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge alert</DialogTitle>
            <DialogDescription>
              {ackTarget ? `${RULES[ackTarget.rule_key]?.label ?? ackTarget.rule_key} — ${ackTarget.event_count} event(s) by ${ackTarget.subject_label ?? "unknown"}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ack-note">Review note (optional)</Label>
            <Textarea id="ack-note" value={ackNote} onChange={(e) => setAckNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAckTarget(null)}>Cancel</Button>
            <Button
              onClick={() => ackTarget && acknowledge.mutate({ id: ackTarget.id, note: ackNote })}
              disabled={acknowledge.isPending}
            >
              {acknowledge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
