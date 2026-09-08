import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Timer } from "lucide-react";
import { format, startOfMonth, subDays } from "date-fns";
import { downloadCSVString } from "@/lib/download-utils";
import { toast } from "sonner";

type Row = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  notes: string | null;
};

const MAX_DAILY_HOURS = 16;

function hoursFor(row: Row): number | null {
  if (!row.check_in || !row.check_out) return null;
  const ms = new Date(row.check_out).getTime() - new Date(row.check_in).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / 3_600_000, MAX_DAILY_HOURS);
}

function fmtHours(h: number | null) {
  if (h == null) return "—";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${String(mins).padStart(2, "0")}m`;
}

function csvCell(value: string | number | null) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function MyHoursDashboard() {
  const { user } = useAuth();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: profile } = useQuery({
    queryKey: ["my-profile-hours", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-hours", profile?.id, from, to],
    enabled: !!profile && !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("id, date, check_in, check_out, status, notes")
        .eq("profile_id", profile!.id)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const stats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let open = 0;
    let late = 0;
    for (const r of rows) {
      const h = hoursFor(r);
      if (h != null) {
        total += h;
        completed += 1;
      } else if (r.check_in) {
        open += 1;
      }
      if (r.status === "late") late += 1;
    }
    return {
      total,
      completed,
      open,
      late,
      days: rows.length,
      avg: completed > 0 ? total / completed : null,
    };
  }, [rows]);

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("No attendance records in this range to export");
      return;
    }
    const header = ["Date", "Check in", "Check out", "Hours worked", "Status", "Notes"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const h = hoursFor(r);
      lines.push(
        [
          csvCell(r.date),
          csvCell(r.check_in ? format(new Date(r.check_in), "HH:mm:ss") : ""),
          csvCell(r.check_out ? format(new Date(r.check_out), "HH:mm:ss") : ""),
          csvCell(h == null ? "" : h.toFixed(2)),
          csvCell(r.status ?? ""),
          csvCell(r.notes ?? ""),
        ].join(","),
      );
    }
    lines.push("");
    lines.push(`Total hours,${stats.total.toFixed(2)}`);
    const name = profile ? `${profile.first_name}-${profile.last_name}` : "my";
    downloadCSVString(lines.join("\n"), `${name}-hours-${from}-to-${to}.csv`);
    toast.success("CSV exported");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
          My daily hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="my-hours-from" className="text-xs">From</Label>
            <Input id="my-hours-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="my-hours-to" className="text-xs">To</Label>
            <Input id="my-hours-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFrom(format(subDays(new Date(), 6), "yyyy-MM-dd")); setTo(format(new Date(), "yyyy-MM-dd")); }}>
            Last 7 days
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(format(startOfMonth(new Date()), "yyyy-MM-dd")); setTo(format(new Date(), "yyyy-MM-dd")); }}>
            This month
          </Button>
          <Button size="sm" className="gap-2 ml-auto" onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Total hours</div>
            <div className="text-lg font-semibold">{fmtHours(stats.total)}</div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Days recorded</div>
            <div className="text-lg font-semibold">{stats.days}</div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Average per day</div>
            <div className="text-lg font-semibold">{fmtHours(stats.avg)}</div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">Open / late</div>
            <div className="text-lg font-semibold">{stats.open} / {stats.late}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Check in</th>
                <th className="py-2 pr-3">Check out</th>
                <th className="py-2 pr-3">Hours</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No attendance records in this range.</td></tr>
              ) : (
                rows.map((r) => {
                  const h = hoursFor(r);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{format(new Date(`${r.date}T00:00:00`), "dd/MM/yyyy")}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.check_in ? format(new Date(r.check_in), "HH:mm:ss") : "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.check_out ? format(new Date(r.check_out), "HH:mm:ss") : "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap font-medium">{h == null ? (r.check_in ? "In progress" : "—") : fmtHours(h)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{r.status ?? "—"}</Badge>
                      </td>
                      <td className="py-2 max-w-[240px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
