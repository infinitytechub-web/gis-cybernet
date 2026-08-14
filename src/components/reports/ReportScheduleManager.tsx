import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Play, CalendarClock, Users, CalendarCheck, CalendarOff, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type ScheduleReportType = "staff" | "attendance" | "leave";
type ScheduleFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

const REPORT_TYPE_CONFIG: Record<ScheduleReportType, { label: string; icon: any; color: string }> = {
  staff: { label: "Staff Summary", icon: Users, color: "text-blue-600 dark:text-blue-400" },
  attendance: { label: "Attendance", icon: CalendarCheck, color: "text-emerald-600 dark:text-emerald-400" },
  leave: { label: "Leave/Pass", icon: CalendarOff, color: "text-orange-600 dark:text-orange-400" },
};

const FREQUENCY_CONFIG: Record<ScheduleFrequency, { label: string; badge: string; cron: string }> = {
  daily: { label: "Daily", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", cron: "Every day at 6:00 AM" },
  weekly: { label: "Weekly", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", cron: "Every Monday at 6:00 AM" },
  monthly: { label: "Monthly", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", cron: "1st of each month at 6:00 AM" },
  quarterly: { label: "Quarterly", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", cron: "1st of every 3rd month at 6:00 AM" },
  annually: { label: "Annually", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", cron: "1st of January at 6:00 AM" },
};

export default function ReportScheduleManager() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [selectedTypes, setSelectedTypes] = useState<Set<ScheduleReportType>>(new Set(["staff"]));
  const [newFreq, setNewFreq] = useState<ScheduleFrequency>("daily");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; report_type: ScheduleReportType; frequency: ScheduleFrequency } | null>(null);

  const toggleType = (t: ScheduleReportType) => {
    setSelectedTypes((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  };

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["report-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const types = Array.from(selectedTypes);
      if (types.length === 0) throw new Error("Select at least one report type");
      const rows = types.map((t) => ({
        report_type: t,
        frequency: newFreq,
        enabled: true,
        created_by: user!.id,
      }));
      const { error } = await supabase.from("report_schedules").insert(rows);
      if (error) {
        if (error.code === "23505") throw new Error("One or more of these schedules already exist");
        throw error;
      }
      return types.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success(`${count} schedule${count > 1 ? "s" : ""} created`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: { id: string; report_type: ScheduleReportType; frequency: ScheduleFrequency }) => {
      const { error } = await supabase
        .from("report_schedules")
        .update({ report_type: vals.report_type, frequency: vals.frequency })
        .eq("id", vals.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Schedule updated");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("report_schedules")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Schedule updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await softDelete({ table: "report_schedules", id, label: "Report schedule" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Schedule removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runNowMutation = useMutation({
    mutationFn: async (schedule: any) => {
      setRunningId(schedule.id);
      const { data, error } = await supabase.functions.invoke("generate-scheduled-report", {
        body: { report_type: schedule.report_type, frequency: schedule.frequency },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      setRunningId(null);
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success(data?.message || "Report generated successfully");
    },
    onError: (e: any) => {
      setRunningId(null);
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Scheduled Reports
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new schedule - admin only */}
        {isAdmin && (
          <div className="flex flex-col gap-3 p-3 rounded-lg border border-dashed border-border/60 bg-muted/30">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Report Types (composite — pick one or more)</label>
              <div className="flex flex-wrap gap-3">
                {(["staff", "attendance", "leave"] as ScheduleReportType[]).map((t) => {
                  const cfg = REPORT_TYPE_CONFIG[t];
                  return (
                    <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={selectedTypes.has(t)} onCheckedChange={() => toggleType(t)} />
                      <span>{cfg.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                <Select value={newFreq} onValueChange={(v) => setNewFreq(v as ScheduleFrequency)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || selectedTypes.size === 0}
              >
                <Plus className="h-4 w-4" /> Add {selectedTypes.size > 1 ? `${selectedTypes.size} Schedules` : "Schedule"}
              </Button>
            </div>
          </div>
        )}

        {/* Schedule list */}
        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground">Loading schedules...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No report schedules configured. {isAdmin ? "Add one above to get started." : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s: any) => {
                  const typeConfig = REPORT_TYPE_CONFIG[s.report_type as ScheduleReportType];
                  const freqConfig = FREQUENCY_CONFIG[s.frequency as ScheduleFrequency];
                  const Icon = typeConfig?.icon || Clock;

                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${typeConfig?.color}`} />
                          <span className="font-medium text-sm">{typeConfig?.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={freqConfig?.badge}>
                          {freqConfig?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {freqConfig?.cron}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.last_run_at ? (
                          <span title={format(new Date(s.last_run_at), "dd/MM/yyyy HH:mm")}>
                            {formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Switch
                            checked={s.enabled}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: s.id, enabled: checked })}
                          />
                        ) : (
                          <Badge variant={s.enabled ? "default" : "secondary"}>
                            {s.enabled ? "Active" : "Paused"}
                          </Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={() => runNowMutation.mutate(s)}
                              disabled={runningId === s.id}
                            >
                              {runningId === s.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              Run Now
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit"
                              onClick={() => setEditing({ id: s.id, report_type: s.report_type, frequency: s.frequency })}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => deleteMutation.mutate(s.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ​
        </p>
        <p className="text-xs text-muted-foreground">
          ​
        </p>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Report Type</label>
                <Select
                  value={editing.report_type}
                  onValueChange={(v) => setEditing({ ...editing, report_type: v as ScheduleReportType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff Summary</SelectItem>
                    <SelectItem value="attendance">Attendance</SelectItem>
                    <SelectItem value="leave">Leave/Pass</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                <Select
                  value={editing.frequency}
                  onValueChange={(v) => setEditing({ ...editing, frequency: v as ScheduleFrequency })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={editMutation.isPending}
              onClick={() => editing && editMutation.mutate(editing)}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
