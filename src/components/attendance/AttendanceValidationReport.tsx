import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { downloadBlob } from "@/lib/download-utils";

const PERIODS = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Annually"]] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ddmmyyyy = (s: string) => s.split("-").reverse().join("/");

/** Attendance validation across all commands the user may see, grouped by period. */
export function AttendanceValidationReport() {
  const [period, setPeriod] = useState<string>("day");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["attendance_validation", period, from, to],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("attendance_validation", { _period: period, _from: from, _to: to });
      if (error) throw error;
      return data ?? [];
    },
  });
  const issues = (r: (typeof data)[number]) => Number(r.missing_checkout) + Number(r.invalid_times) + Number(r.duplicates);
  const exportCsv = () => {
    const head = ["Period", "Command/Unit", "Staff", "Records", "Check-ins", "Check-outs", "Total hours", "Avg hours", "Present", "Late", "Absent", "Excused", "Missing check-out", "Check-out before check-in", "Duplicates"];
    const rows = data.map((r) => [ddmmyyyy(r.period_start), r.unit_name, r.staff_count, r.records, r.checked_in, r.checked_out, r.total_hours, r.avg_hours, r.present, r.late, r.absent, r.excused, r.missing_checkout, r.invalid_times, r.duplicates]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), `attendance-validation-${period}-${from}-${to}.csv`);
  };
  return (
    <Card>
      <CardHeader><CardTitle>Attendance validation – all commands</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          {PERIODS.map(([v, l]) => <Button key={v} size="sm" variant={period === v ? "default" : "outline"} onClick={() => setPeriod(v)}>{l}</Button>)}
          <div className="w-36"><DateInput value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" /></div>
          <div className="w-36"><DateInput value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" /></div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data.length}>Export CSV</Button>
        </div>
        {error && <p className="text-destructive">Could not load: {(error as Error).message}</p>}
        <div className="max-h-[480px] overflow-auto rounded-md border">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="sticky top-0 bg-muted"><tr>{["Period", "Command/Unit", "Staff", "Check-ins", "Check-outs", "Present", "Late", "Absent", "Excused", "Hours", "Avg hrs", "Issues"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {!isLoading && !data.length && <tr><td className="p-2 text-muted-foreground" colSpan={12}>No check-in records in this range.</td></tr>}
              {isLoading && <tr><td className="p-2" colSpan={12}>Loading…</td></tr>}
              {data.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{ddmmyyyy(r.period_start)}</td><td className="p-2">{r.unit_name}</td><td className="p-2">{r.staff_count}</td><td className="p-2">{r.checked_in}</td><td className="p-2">{r.checked_out}</td>
                  <td className="p-2">{r.present}</td><td className="p-2">{r.late}</td><td className="p-2">{r.absent}</td><td className="p-2">{r.excused}</td><td className="p-2">{r.total_hours}</td><td className="p-2">{r.avg_hours}</td>
                  <td className="p-2">{issues(r) ? <Badge variant="destructive" title={`Missing check-out ${r.missing_checkout}, invalid times ${r.invalid_times}, duplicates ${r.duplicates}`}>⚠ {issues(r)} to review</Badge> : <Badge variant="secondary">✓ Valid</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
