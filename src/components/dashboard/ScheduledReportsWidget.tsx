import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Users, CalendarCheck, CalendarOff, Clock, Play, Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Users; color: string }> = {
  staff: { label: "Staff Summary", icon: Users, color: "text-blue-600 dark:text-blue-400" },
  attendance: { label: "Attendance", icon: CalendarCheck, color: "text-emerald-600 dark:text-emerald-400" },
  leave: { label: "Leave/Pass", icon: CalendarOff, color: "text-orange-600 dark:text-orange-400" },
};

const FREQ_BADGE: Record<string, string> = {
  daily: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  weekly: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  monthly: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function ScheduledReportsWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["dashboard-report-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*")
        .eq("enabled", true)
        .order("next_run_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const runNow = useMutation({
    mutationFn: async ({ report_type, frequency }: { report_type: string; frequency: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-scheduled-report", {
        body: { report_type, frequency },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Report generated: ${data.records ?? 0} records`);
      queryClient.invalidateQueries({ queryKey: ["dashboard-report-schedules"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate report"),
  });

  if (isLoading || schedules.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Scheduled Reports
          <Badge variant="outline" className="ml-auto text-[10px]">{schedules.length} active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {schedules.slice(0, 5).map((s: any) => {
          const cfg = TYPE_CONFIG[s.report_type] || { label: s.report_type, icon: Clock, color: "text-muted-foreground" };
          const Icon = cfg.icon;
          const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
          const isPast = nextRun && nextRun < new Date();
          const isRunning = runNow.isPending && runNow.variables?.report_type === s.report_type && runNow.variables?.frequency === s.frequency;

          return (
            <div
              key={s.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/50 transition-colors"
            >
              <Icon className={`h-4 w-4 shrink-0 ${cfg.color} cursor-pointer`} onClick={() => navigate("/reports")} />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate("/reports")}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{cfg.label}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${FREQ_BADGE[s.frequency] || ""}`}>
                    {s.frequency}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                  <Clock className="h-3 w-3" />
                  {nextRun ? (
                    <span className={isPast ? "text-warning" : ""}>
                      {isPast ? "Overdue — " : "Next: "}
                      {formatDistanceToNow(nextRun, { addSuffix: true })}
                    </span>
                  ) : (
                    <span>Not scheduled yet</span>
                  )}
                  {s.last_run_at && (
                    <span className="ml-2 text-muted-foreground/70">
                      · Last: {format(new Date(s.last_run_at), "dd MMM HH:mm")}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                disabled={isRunning}
                onClick={(e) => {
                  e.stopPropagation();
                  runNow.mutate({ report_type: s.report_type, frequency: s.frequency });
                }}
                title="Run now"
              >
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            </div>
          );
        })}
        {schedules.length > 5 && (
          <button
            onClick={() => navigate("/reports")}
            className="text-xs text-primary hover:underline w-full text-center pt-1"
          >
            View all {schedules.length} schedules →
          </button>
        )}
      </CardContent>
    </Card>
  );
}
