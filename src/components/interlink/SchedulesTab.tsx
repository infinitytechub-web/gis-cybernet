import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, CalendarClock, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { REPORT_KIND_LABELS, type InterlinkReportKind, type InterlinkScope } from "@/lib/interlink-types";

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface ScheduleForm {
  name: string;
  description: string;
  frequency: "daily" | "weekly" | "monthly";
  run_time: string;
  day_of_week: number;
  day_of_month: number;
  scope: Exclude<InterlinkScope, "mixed">;
  report_kind: InterlinkReportKind;
  subject_template: string;
  message_template: string;
  attachment_rule_id: string | null;
  reviewer_id: string | null;
  approver_id: string | null;
  requires_per_run_approval: boolean;
  recipient_adhoc_emails: string;
}

const EMPTY_FORM: ScheduleForm = {
  name: "",
  description: "",
  frequency: "daily",
  run_time: "08:00",
  day_of_week: 1,
  day_of_month: 1,
  scope: "extranet",
  report_kind: "daily",
  subject_template: "{name} — {date}",
  message_template: "",
  attachment_rule_id: null,
  reviewer_id: null,
  approver_id: null,
  requires_per_run_approval: true,
  recipient_adhoc_emails: "",
};

export function SchedulesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["interlink-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interlink_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["interlink-rules-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("interlink_attachment_rules")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: commandUsers = [] } = useQuery({
    queryKey: ["interlink-command-users"],
    queryFn: async () => {
      const { data } = await supabase.rpc("search_authorising_officers", { _limit: 50 });
      return data ?? [];
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      frequency: s.frequency,
      run_time: s.run_time,
      day_of_week: s.day_of_week ?? 1,
      day_of_month: s.day_of_month ?? 1,
      scope: s.scope,
      report_kind: s.report_kind,
      subject_template: s.subject_template,
      message_template: s.message_template ?? "",
      attachment_rule_id: s.attachment_rule_id,
      reviewer_id: s.reviewer_id,
      approver_id: s.approver_id,
      requires_per_run_approval: s.requires_per_run_approval,
      recipient_adhoc_emails: (s.recipient_adhoc_emails ?? []).join(", "),
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.subject_template.trim()) {
      toast.error("Name and subject template are required");
      return;
    }
    setSaving(true);
    try {
      const adhoc = form.recipient_adhoc_emails
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        frequency: form.frequency,
        run_time: form.run_time,
        day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
        day_of_month: form.frequency === "monthly" ? form.day_of_month : null,
        scope: form.scope,
        report_kind: form.report_kind,
        subject_template: form.subject_template.trim(),
        message_template: form.message_template.trim() || null,
        attachment_rule_id: form.attachment_rule_id,
        reviewer_id: form.reviewer_id,
        approver_id: form.approver_id,
        requires_per_run_approval: form.requires_per_run_approval,
        recipient_adhoc_emails: adhoc,
        created_by: userId,
      };

      const { error } = editing
        ? await supabase.from("interlink_schedules").update(payload).eq("id", editing.id)
        : await supabase.from("interlink_schedules").insert(payload);

      if (error) throw error;
      toast.success(editing ? "Schedule updated" : "Schedule created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["interlink-schedules"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: any) {
    const { error } = await supabase
      .from("interlink_schedules")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["interlink-schedules"] });
  }

  async function remove(s: any) {
    if (!confirm(`Delete schedule "${s.name}"?`)) return;
    const { error } = await supabase.from("interlink_schedules").delete().eq("id", s.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Schedule deleted");
      qc.invalidateQueries({ queryKey: ["interlink-schedules"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-600" /> Auto-dispatch schedules
          </h3>
          <p className="text-xs text-muted-foreground">
            Daily, weekly or monthly auto-drafts. Each run creates a draft awaiting approval.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
          <Plus className="h-4 w-4 mr-1.5" /> New schedule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="inline h-4 w-4 animate-spin" /></TableCell></TableRow>
              ) : schedules.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground italic">No schedules yet — create one above.</TableCell></TableRow>
              ) : schedules.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{REPORT_KIND_LABELS[s.report_kind as InterlinkReportKind]} · {s.scope}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="capitalize">{s.frequency}</Badge>
                    <div className="mt-1 text-muted-foreground">
                      {s.run_time}
                      {s.frequency === "weekly" && ` · ${WEEKDAYS[s.day_of_week ?? 0]}`}
                      {s.frequency === "monthly" && ` · day ${s.day_of_month}`}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.next_run_at ? format(new Date(s.next_run_at), "PPp") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.requires_per_run_approval ? "default" : "secondary"} className="text-[10px]">
                      {s.requires_per_run_approval ? "Per-run" : "Pre-approved"}
                    </Badge>
                  </TableCell>
                  <TableCell><Switch checked={s.is_active} onCheckedChange={() => toggle(s)} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle>
            <DialogDescription>
              Auto-drafts a dispatch on the cadence. Tokens supported in subject/message: {"{name} {kind} {date} {scope}"}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
            </div>

            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v: any) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Run time (Africa/Accra)</Label>
              <Input type="time" value={form.run_time} onChange={(e) => setForm({ ...form, run_time: e.target.value })} />
            </div>
            {form.frequency === "weekly" && (
              <div>
                <Label>Day of week</Label>
                <Select value={String(form.day_of_week)} onValueChange={(v) => setForm({ ...form, day_of_week: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((w, i) => <SelectItem key={i} value={String(i)}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.frequency === "monthly" && (
              <div>
                <Label>Day of month (1–28)</Label>
                <Input type="number" min={1} max={28} value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: Math.min(28, Math.max(1, Number(e.target.value))) })} />
              </div>
            )}

            <div>
              <Label>Scope</Label>
              <Select value={form.scope} onValueChange={(v: any) => setForm({ ...form, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intranet">Intranet</SelectItem>
                  <SelectItem value="internet">Internet</SelectItem>
                  <SelectItem value="extranet">Extranet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Report kind</Label>
              <Select value={form.report_kind} onValueChange={(v: any) => setForm({ ...form, report_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(REPORT_KIND_LABELS) as InterlinkReportKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{REPORT_KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>Subject template</Label>
              <Input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Message template (optional)</Label>
              <Textarea value={form.message_template} onChange={(e) => setForm({ ...form, message_template: e.target.value })} rows={3} />
            </div>

            <div>
              <Label>Attachment rule</Label>
              <Select
                value={form.attachment_rule_id ?? "__none__"}
                onValueChange={(v) => setForm({ ...form, attachment_rule_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {rules.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Per-run approval required</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={form.requires_per_run_approval}
                  onCheckedChange={(v) => setForm({ ...form, requires_per_run_approval: v })} />
                <span className="text-xs text-muted-foreground">{form.requires_per_run_approval ? "Each run waits for approval" : "Pre-approved at creation"}</span>
              </div>
            </div>

            <div>
              <Label>Reviewer (optional)</Label>
              <Select
                value={form.reviewer_id ?? "__none__"}
                onValueChange={(v) => setForm({ ...form, reviewer_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="— pick reviewer —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {commandUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Approver</Label>
              <Select
                value={form.approver_id ?? "__none__"}
                onValueChange={(v) => setForm({ ...form, approver_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="— pick approver —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— any command tier —</SelectItem>
                  {commandUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>Ad-hoc recipient emails</Label>
              <Textarea value={form.recipient_adhoc_emails}
                onChange={(e) => setForm({ ...form, recipient_adhoc_emails: e.target.value })}
                rows={2} placeholder="ops@partner.gov.gh, hq@example.com" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
