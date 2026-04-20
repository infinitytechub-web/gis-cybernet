import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Play, CalendarClock, Users, CalendarCheck, CalendarOff, Plus, Loader2 } from "lucide-react";
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
  const [newType, setNewType] = useState<ScheduleReportType>("staff");
  const [newFreq, setNewFreq] = useState<ScheduleFrequency>("daily");
  const [runningId, setRunningId] = useState<string | null>(null);

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
      const { error } = await supabase.from("report_schedules").insert({
        report_type: newType,
        frequency: newFreq,
        enabled: true,
        created_by: user!.id,
      });
      if (error) {
        if (error.code === "23505") throw new Error("This schedule already exists");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Schedule created");
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
          <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg border border-dashed border-border/60 bg-muted/30">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Report Type</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as ScheduleReportType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff Summary</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="leave">Leave/Pass</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
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
              disabled={createMutation.isPending}
            >
              <Plus className="h-4 w-4" /> Add Schedule
            </Button>
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
                          <span title={format(new Date(s.last_run_at), "dd MMM yyyy HH:mm")}>
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
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(s.id)}
                            >
                              Remove
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
          Scheduled reports are auto-generated as CSV files and saved to Uploaded Reports. Email delivery requires email domain setup.
        </p>
      </CardContent>
    </Card>
  );
}
