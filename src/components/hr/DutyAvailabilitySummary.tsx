import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRbac } from "@/hooks/useRbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardSyncStatus } from "@/components/dashboard/DashboardSyncStatus";
import { dashboardRetry, sumCounts } from "@/lib/dashboard-integrity";
import { CalendarClock, CalendarOff, HeartPulse, ClipboardList } from "lucide-react";

type DutySummary = {
  day: string;
  shifts: { assigned_staff: number; assignments: number };
  on_leave: number;
  excused_today: number;
  excuse_requests: Record<string, number>;
};

export function DutyAvailabilitySummary({ command, since, personal = false }: { command?: string; since?: string | null; personal?: boolean }) {
  const { canPath } = useRbac();
  const result = useQuery({
    queryKey: ["hr-duty-summary", command, since, personal],
    refetchInterval: 60_000,
    retry: dashboardRetry,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_duty_dashboard_summary", {
        _org_unit_id: command && command !== "all" ? command : undefined,
        _since: since ?? undefined,
        _self: personal,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("shifts" in data)) throw new Error("Duty figures unavailable");
      return data as unknown as DutySummary;
    },
  });
  const data = result.isError ? undefined : result.data;
  const cards = [
    { title: personal ? "My assigned shifts today" : "Staff assigned shifts today", value: data?.shifts.assigned_staff, note: data ? `${data.shifts.assignments} current assignments` : undefined, path: personal ? "/my-shift" : "/shifts", icon: CalendarClock },
    { title: personal ? "My approved leave today" : "Staff on approved leave today", value: data?.on_leave, path: "/leave", icon: CalendarOff },
    { title: personal ? "My approved excuse today" : "Staff excused today", value: data?.excused_today, path: "/excuse-duty/mine", icon: HeartPulse },
    { title: personal ? "My excuse duty requests" : "Excuse duty requests", value: data ? sumCounts(data.excuse_requests) : undefined, path: personal ? "/excuse-duty/mine" : "/health-lab", icon: ClipboardList, parts: data?.excuse_requests },
  ];
  return <section aria-label={personal ? "My shifts and leave" : "Shifts, leave and excuse duty"} className="space-y-3">
    <h2 className="text-base font-semibold">{personal ? "My shifts and leave" : "Shifts, leave & excuse duty"}</h2>
    <DashboardSyncStatus updatedAt={result.dataUpdatedAt} failed={result.isError} fetching={result.isFetching} onRetry={() => void result.refetch()} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ title, value, note, path, icon: Icon, parts }) => <Card key={title}>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-medium">{title}</h3><Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></div>
          <p className="text-2xl font-semibold tabular-nums">{value ?? (result.isError ? "—" : "…")}</p>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {parts && <div className="flex flex-wrap gap-1">{Object.entries(parts).map(([status, count]) => <Badge key={status} variant="secondary" className="capitalize">{status}: {count}</Badge>)}</div>}
          {canPath(path) && <Button asChild variant="link" size="sm" className="px-0"><Link to={path}>Open</Link></Button>}
        </CardContent>
      </Card>)}
    </div>
  </section>;
}