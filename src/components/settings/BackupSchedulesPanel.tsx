// Admin-only Schedules panel for System Backup. Lets admins create recurring
// backups (hourly / daily / weekly / monthly / quarterly / annually) with their
// own retention. An hourly pg_cron job invokes `run-backup-schedules` to run
// anything that's due.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Pencil, Trash2, PlayCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const FREQUENCIES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
] as const;

const ALLOWED_TABLES = [
  "profiles","user_roles","departments","ranks","shifts","shift_assignments",
  "attendances","leave_requests","postings_transfers","holidays","announcements","app_settings",
];

interface Schedule {
  id: string;
  name: string;
  frequency: string;
  tables_included: string[];
  retention_days: number | null;
  is_active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  next_run_at: string;
}

export function BackupSchedulesPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["system-backup-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_backup_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Schedule[];
    },
    refetchInterval: 60_000,
  });

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete schedule "${name}"?`)) return;
    const { error } = await supabase.from("system_backup_schedules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Schedule deleted");
    queryClient.invalidateQueries({ queryKey: ["system-backup-schedules"] });
  };

  const toggleActive = async (s: Schedule) => {
    const { error } = await supabase.from("system_backup_schedules")
      .update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["system-backup-schedules"] });
  };

  const runNow = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("run-backup-schedules", { body: {} });
      if (error) throw error;
      toast.success(`Processed ${(data as any)?.processed ?? 0} schedule(s)`);
      queryClient.invalidateQueries({ queryKey: ["system-backup-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["system-backup-snapshots"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" /> Backup Schedules
        </CardTitle>
        <CardDescription>
          Configure recurring backups. The hourly background job runs any schedule whose
          next run has passed and prunes older snapshots based on each schedule's retention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-4 w-4" /> New schedule
          </Button>
          <Button size="sm" variant="outline" onClick={runNow} className="gap-1">
            <PlayCircle className="h-4 w-4" /> Run due now
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{schedules.length} schedule(s)</span>
        </div>

        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && schedules.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No schedules yet.</TableCell></TableRow>
              )}
              {schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{s.frequency}</Badge></TableCell>
                  <TableCell className="text-xs">{s.retention_days ? `${s.retention_days} days` : "Keep all"}</TableCell>
                  <TableCell className="text-xs">{s.tables_included?.length ?? 0}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {s.last_run_at ? (
                      <div>
                        <div>{format(new Date(s.last_run_at), "dd MMM HH:mm")}</div>
                        {s.last_run_status && <Badge variant="outline" className="text-[10px] mt-1 capitalize">{s.last_run_status}</Badge>}
                      </div>
                    ) : <span className="text-muted-foreground">Never</span>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(s.next_run_at), "dd MMM HH:mm")}</TableCell>
                  <TableCell><Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.id, s.name)} title="Delete" className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <ScheduleDialog
        open={creating || !!editing}
        existing={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["system-backup-schedules"] })}
      />
    </Card>
  );
}

function ScheduleDialog({
  open, existing, onClose, onSaved,
}: { open: boolean; existing: Schedule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<string>("daily");
  const [retention, setRetention] = useState<string>("30");
  const [tables, setTables] = useState<Set<string>>(new Set(ALLOWED_TABLES));
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useState(() => {
    if (existing) {
      setName(existing.name);
      setFrequency(existing.frequency);
      setRetention(existing.retention_days ? String(existing.retention_days) : "");
      setTables(new Set(existing.tables_included ?? ALLOWED_TABLES));
      setActive(existing.is_active);
    }
  });

  // Sync when `existing` changes
  useEffectOnExisting(existing, () => {
    if (existing) {
      setName(existing.name);
      setFrequency(existing.frequency);
      setRetention(existing.retention_days ? String(existing.retention_days) : "");
      setTables(new Set(existing.tables_included ?? ALLOWED_TABLES));
      setActive(existing.is_active);
    } else {
      setName(""); setFrequency("daily"); setRetention("30");
      setTables(new Set(ALLOWED_TABLES)); setActive(true);
    }
  });

  const toggleTable = (t: string) => {
    const next = new Set(tables);
    next.has(t) ? next.delete(t) : next.add(t);
    setTables(next);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (tables.size === 0) return toast.error("Select at least one table");
    const days = retention.trim() === "" ? null : Number(retention);
    if (days !== null && (Number.isNaN(days) || days < 1 || days > 3650)) {
      return toast.error("Retention days must be 1–3650, or blank");
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      frequency,
      tables_included: Array.from(tables),
      retention_days: days,
      is_active: active,
    };
    let error: any;
    if (existing) {
      ({ error } = await supabase.from("system_backup_schedules").update(payload).eq("id", existing.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase.from("system_backup_schedules").insert({ ...payload, created_by: u.user?.id }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Schedule updated" : "Schedule created");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit schedule" : "New backup schedule"}</DialogTitle>
          <DialogDescription>
            Schedules run via the hourly background job. Each run is recorded in the audit log and snapshot library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sched-name">Name</Label>
            <Input id="sched-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-retention">Retention (days)</Label>
              <Input id="sched-retention" type="number" min={1} max={3650} placeholder="Blank = keep all"
                value={retention} onChange={(e) => setRetention(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tables to back up ({tables.size}/{ALLOWED_TABLES.length})</Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto rounded border p-2">
              {ALLOWED_TABLES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={tables.has(t)} onCheckedChange={() => toggleTable(t)} />
                  <span className="font-mono">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="sched-active" />
            <Label htmlFor="sched-active" className="cursor-pointer">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? "Save changes" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tiny helper: run callback whenever `existing` reference changes.
import { useEffect } from "react";
function useEffectOnExisting(value: unknown, cb: () => void) {
  useEffect(cb, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}
