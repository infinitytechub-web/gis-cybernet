/**
 * Automated biometric enrollment reminders (administrator only).
 *
 * Staff who still need a passkey are reminded on a schedule: once they are
 * within the configured lead window of the deadline (grace reminders) and again,
 * more frequently, after the deadline has passed (overdue reminders). Messages
 * are template driven and delivered in-app and/or by email.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BellRing, Loader2, RefreshCw, Send } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";

interface ReminderSettings {
  id: string;
  enabled: boolean;
  grace_lead_days: number;
  grace_interval_days: number;
  overdue_interval_days: number;
  send_hour_utc: number;
  notify_in_app: boolean;
  notify_email: boolean;
  grace_subject: string;
  grace_body: string;
  overdue_subject: string;
  overdue_body: string;
  batch_size: number;
  paused_reason: string | null;
  last_run_at: string | null;
  last_run_summary: Record<string, unknown> | null;
}

interface LogRow {
  id: string;
  user_id: string;
  kind: string;
  channel: string;
  subject: string | null;
  status: string;
  detail: string | null;
  days_left: number | null;
  created_at: string;
}

const PLACEHOLDERS = "{{name}}, {{days_left}}, {{deadline}}, {{staff_id}}";

export function BiometricReminderCard() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s, error: se }, { data: l }] = await Promise.all([
      supabase.from("biometric_reminder_settings").select("*").order("created_at").limit(1).maybeSingle(),
      supabase
        .from("biometric_reminder_log")
        .select("id,user_id,kind,channel,subject,status,detail,days_left,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setLoading(false);
    if (se) {
      toast({ title: "Could not load reminder settings", description: se.message, variant: "destructive" });
      return;
    }
    setSettings((s as unknown as ReminderSettings) ?? null);
    setLogs((l as unknown as LogRow[]) ?? []);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback((changes: Partial<ReminderSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...changes } : prev));
  }, []);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("biometric_reminder_update_settings", {
      _patch: {
        enabled: settings.enabled,
        grace_lead_days: settings.grace_lead_days,
        grace_interval_days: settings.grace_interval_days,
        overdue_interval_days: settings.overdue_interval_days,
        send_hour_utc: settings.send_hour_utc,
        notify_in_app: settings.notify_in_app,
        notify_email: settings.notify_email,
        grace_subject: settings.grace_subject,
        grace_body: settings.grace_body,
        overdue_subject: settings.overdue_subject,
        overdue_body: settings.overdue_body,
        batch_size: settings.batch_size,
      },
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    setSettings((data as unknown as ReminderSettings) ?? settings);
    toast({ title: "Reminder schedule saved" });
  }, [settings, toast]);

  const runNow = useCallback(async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("biometric-enrollment-reminders", {
      body: { force: true },
    });
    setRunning(false);
    if (error) {
      toast({ title: "Reminder run failed", description: error.message, variant: "destructive" });
      return;
    }
    // deno-lint-ignore no-explicit-any
    const r = (data ?? {}) as Record<string, unknown>;
    toast({
      title: r.ran ? "Reminders sent" : "Nothing to send",
      description: r.ran
        ? `${r.considered ?? 0} staff reminded (${r.in_app ?? 0} in-app, ${r.sent ?? 0} email).`
        : String(r.reason ?? "No staff are currently due a reminder."),
    });
    void load();
  }, [load, toast]);

  if (loading || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            Enrollment reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {loading ? "Loading reminder schedule…" : "Reminder settings are unavailable."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Automated enrollment reminders
        </CardTitle>
        <CardDescription>
          Reminds staff who still need a passkey — during the grace period and again once they are
          overdue. Placeholders available in templates: {PLACEHOLDERS}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div className="flex items-center gap-3">
            <Switch
              id="bio-reminders-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
            <Label htmlFor="bio-reminders-enabled">Send reminders automatically</Label>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {settings.last_run_at ? (
              <span>Last run {formatDateTime(settings.last_run_at)}</span>
            ) : (
              <span>Never run</span>
            )}
            {settings.paused_reason && <Badge variant="destructive">Paused</Badge>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="bio-lead">Start reminding (days before deadline)</Label>
            <Input
              id="bio-lead"
              type="number"
              min={0}
              max={365}
              value={settings.grace_lead_days}
              onChange={(e) => patch({ grace_lead_days: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio-grace-int">Grace reminder every (days)</Label>
            <Input
              id="bio-grace-int"
              type="number"
              min={1}
              max={60}
              value={settings.grace_interval_days}
              onChange={(e) => patch({ grace_interval_days: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio-overdue-int">Overdue reminder every (days)</Label>
            <Input
              id="bio-overdue-int"
              type="number"
              min={1}
              max={60}
              value={settings.overdue_interval_days}
              onChange={(e) => patch({ overdue_interval_days: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio-hour">Send hour (UTC)</Label>
            <Input
              id="bio-hour"
              type="number"
              min={0}
              max={23}
              value={settings.send_hour_utc}
              onChange={(e) => patch({ send_hour_utc: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="bio-inapp"
              checked={settings.notify_in_app}
              onCheckedChange={(v) => patch({ notify_in_app: v })}
            />
            <Label htmlFor="bio-inapp">In-app notification</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="bio-email"
              checked={settings.notify_email}
              onCheckedChange={(v) => patch({ notify_email: v })}
            />
            <Label htmlFor="bio-email">Email</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="bio-batch" className="whitespace-nowrap">Max per run</Label>
            <Input
              id="bio-batch"
              className="w-24"
              type="number"
              min={1}
              max={500}
              value={settings.batch_size}
              onChange={(e) => patch({ batch_size: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <Badge variant="secondary">Grace period template</Badge>
            <div className="space-y-1">
              <Label htmlFor="bio-grace-subject">Subject</Label>
              <Input
                id="bio-grace-subject"
                value={settings.grace_subject}
                onChange={(e) => patch({ grace_subject: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bio-grace-body">Message</Label>
              <Textarea
                id="bio-grace-body"
                rows={5}
                value={settings.grace_body}
                onChange={(e) => patch({ grace_body: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Badge variant="destructive">Overdue template</Badge>
            <div className="space-y-1">
              <Label htmlFor="bio-overdue-subject">Subject</Label>
              <Input
                id="bio-overdue-subject"
                value={settings.overdue_subject}
                onChange={(e) => patch({ overdue_subject: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bio-overdue-body">Message</Label>
              <Textarea
                id="bio-overdue-body"
                rows={5}
                value={settings.overdue_body}
                onChange={(e) => patch({ overdue_body: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save schedule
          </Button>
          <Button variant="outline" onClick={() => void runNow()} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send due reminders now
          </Button>
          <Button variant="ghost" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Recent reminders</h4>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Days left</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No reminders have been sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={r.kind === "overdue" ? "destructive" : "secondary"}>
                          {r.kind === "overdue" ? "Overdue" : "Grace"}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.channel === "email" ? "Email" : "In-app"}</TableCell>
                      <TableCell>{r.days_left ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] text-sm">{r.subject ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
