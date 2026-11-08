import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { attendanceTrend } from "@/lib/command-operations-dashboard";
import { formatDate } from "@/lib/date-format";

const chartConfig = {
  present: { label: "Present", color: "hsl(var(--success))" },
  late: { label: "Late", color: "hsl(var(--warning))" },
  absent: { label: "Absent", color: "hsl(var(--destructive))" },
  excused: { label: "Excused", color: "hsl(var(--primary))" },
};

/** Attendance trends and daily figures for the caller's authorized commands. */
export function AttendanceTrendsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const id = useId();
  const [days, setDays] = useState("7");
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), Number(days) - 1), "yyyy-MM-dd");
  const attendance = useQuery({
    queryKey: ["attendance-trends-panel", user?.id, from, to],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await supabase.rpc("attendance_validation", { _period: "day", _from: from, _to: to });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  useEffect(() => {
    const channel = supabase.channel(`attendance-trends-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, () => { void qc.invalidateQueries({ queryKey: ["attendance-trends-panel"] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, qc]);
  const trend = useMemo(() => attendanceTrend(attendance.data ?? [], from, to), [attendance.data, from, to]);
  const totals = trend.reduce((sum, day) => ({ present: sum.present + day.present, late: sum.late + day.late, absent: sum.absent + day.absent, excused: sum.excused + day.excused }), { present: 0, late: 0, absent: 0, excused: 0 });
  return <Card><CardContent className="min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Attendance trends</h3><p className="text-sm text-muted-foreground">{formatDate(from)} – {formatDate(to)}</p></div><Select value={days} onValueChange={setDays}><SelectTrigger className="w-40" aria-label="Attendance period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem></SelectContent></Select></div>
      {attendance.isPending ? <p role="status">Loading attendance…</p> : attendance.error ? <p className="text-destructive">Attendance trends unavailable.</p> : <>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{Object.entries(chartConfig).map(([key, config]) => <span key={key}>{config.label}: <strong>{totals[key as keyof typeof totals]}</strong></span>)}</div>
        {!attendance.data?.length && <p className="text-sm text-muted-foreground">No attendance recorded in this period.</p>}
        <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto"><BarChart data={trend} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={(date) => formatDate(String(date))} minTickGap={35} /><YAxis allowDecimals={false} width={32} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => formatDate(String(label))} />} />{Object.keys(chartConfig).map((key) => <Bar key={key} dataKey={key} stackId="attendance" fill={`var(--color-${key})`} isAnimationActive={false} />)}</BarChart></ChartContainer>
        <details className="text-sm"><summary className="cursor-pointer font-medium">Daily attendance figures</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full min-w-[500px]"><thead><tr>{["Date", "Present", "Late", "Absent", "Excused"].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{trend.map((day) => <tr key={day.date} className="border-t"><td className="p-2">{formatDate(day.date)}</td>{[day.present, day.late, day.absent, day.excused].map((count, index) => <td className="p-2" key={index}>{count}</td>)}</tr>)}</tbody></table></div></details>
      </>}
  </CardContent></Card>;
}
