import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/date-format";
import { DutyStatusBadge, dutyStateOf } from "@/components/shared/DutyStatusBadge";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

const db = supabase as any;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const working = (s: string | null) => s === "present" || s === "late";

export default function StaffOnDutyDashboard() {
  const now = new Date();
  const today = iso(now);
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [day, setDay] = useState(today);
  const [search, setSearch] = useState("");
  const mFrom = iso(month);
  const mTo = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const att = useQuery({
    queryKey: ["on-duty-month", mFrom, mTo],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("attendances")
        .select("id, date, status, check_in, check_out, profile_id, profiles!inner(first_name, last_name, staff_id, deleted_at)")
        .is("profiles.deleted_at", null).gte("date", mFrom).lte("date", mTo).range(0, 19999);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const leave = useQuery({
    queryKey: ["on-duty-leave", mFrom, mTo],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("leave_requests")
        .select("id, start_date, end_date, profiles!inner(deleted_at)").is("profiles.deleted_at", null)
        .eq("status", "approved").lte("start_date", mTo).gte("end_date", mFrom).range(0, 4999);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, { on: number; absent: number; excused: number }>();
    for (const r of att.data ?? []) {
      const c = m.get(r.date) ?? { on: 0, absent: 0, excused: 0 };
      if (working(r.status)) c.on++; else if (r.status === "absent") c.absent++; else if (r.status === "excused") c.excused++;
      m.set(r.date, c);
    }
    return m;
  }, [att.data]);
  const leaveOn = (d: string) => (leave.data ?? []).filter((r) => r.start_date <= d && r.end_date >= d).length;
  const sel = byDay.get(day) ?? { on: 0, absent: 0, excused: 0 };

  const dayRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (att.data ?? []).filter((r) => r.date === day && working(r.status))
      .filter((r) => !s || `${r.profiles.first_name} ${r.profiles.last_name} ${r.profiles.staff_id}`.toLowerCase().includes(s))
      .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)));
  }, [att.data, day, search]);
  const pager = usePagedList(dayRows, { resetKey: `${day}|${search}` });

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (month.getDay() + 6) % 7;
  const cells = Array.from({ length: lead + daysInMonth }, (_, i) => (i < lead ? null : iso(new Date(month.getFullYear(), month.getMonth(), i - lead + 1))));
  const time = (t: string | null) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
  const loading = att.isLoading || leave.isLoading;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Staff On Duty</h1>
          <p className="text-sm text-muted-foreground">Officers marked present or late, compared with approved leave, for the commands you are authorised to see.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void att.refetch(); void leave.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>
      {(att.isError || leave.isError) && <p role="alert" className="text-destructive">Duty figures could not be loaded.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["On duty", sel.on], ["On approved leave", leaveOn(day)], ["Excused", sel.excused], ["Absent", sel.absent]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{l} · {formatDate(day)}</p>
            <p className="text-3xl font-semibold text-primary">{loading ? "…" : v}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const c = byDay.get(d)?.on ?? 0; const l = leaveOn(d);
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-label={`${formatDate(d)}: ${c} on duty, ${l} on leave`}
                    className={`min-h-12 rounded border p-1 text-left text-xs ${day === d ? "border-primary bg-primary/10" : "border-border"}`}>
                    <div className="font-medium">{Number(d.slice(8))}</div>
                    {c > 0 && <div className="text-primary">{c} on duty</div>}
                    {l > 0 && <div className="text-muted-foreground">{l} on leave</div>}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Officers on duty · {formatDate(day)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search name or staff ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search officers on duty" />
            <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Status</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pager.pageItems.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{loading ? "Loading…" : "No officers marked on duty for this day"}</TableCell></TableRow>}
                  {pager.pageItems.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.profiles.first_name} {r.profiles.last_name}<div className="text-xs text-muted-foreground">{r.profiles.staff_id}</div></TableCell>
                      <TableCell><DutyStatusBadge state={dutyStateOf(r.status, r.check_in, false)} /></TableCell>
                      <TableCell>{time(r.check_in)}</TableCell><TableCell>{time(r.check_out)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPagination {...pager} label="officers on duty" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
