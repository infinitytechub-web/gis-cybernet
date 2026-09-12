/**
 * Leave due / overdue overview.
 *
 * For each active officer in view it compares the annual-leave entitlement for
 * their grade against the approved annual leave they have actually taken this
 * year (weekends and public holidays excluded, matching the rest of the
 * system), and shows who is due to go on leave and who is overdue.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { countLeaveDays, type HolidayDate } from "@/lib/leave-days";
import { formatDate } from "@/lib/date-format";

type LeaveState = "overdue" | "due" | "on_track" | "taken";

const STATE_LABEL: Record<LeaveState, string> = {
  overdue: "Overdue",
  due: "Due",
  on_track: "On track",
  taken: "Fully taken",
};

const STATE_COLOR: Record<LeaveState, string> = {
  overdue: "bg-red-100 text-red-800",
  due: "bg-amber-100 text-amber-800",
  on_track: "bg-sky-100 text-sky-800",
  taken: "bg-emerald-100 text-emerald-800",
};

type Row = {
  id: string;
  staffId: string;
  name: string;
  grade: string;
  entitlement: number;
  taken: number;
  remaining: number;
  lastLeaveEnd: string | null;
  state: LeaveState;
};

export function LeaveDueWidget({ profileIds }: { profileIds?: string[] }) {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("attention");

  const { data, isLoading } = useQuery({
    queryKey: ["leave-due-overview", year, profileIds?.join(",") ?? "all"],
    queryFn: async () => {
      let profileQuery = supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, status, rank_id")
        .in("status", ["active", "partially_active"]);
      if (profileIds?.length) profileQuery = profileQuery.in("id", profileIds);

      const [profilesRes, ranksRes, entRes, leaveRes, holidayRes] = await Promise.all([
        profileQuery,
        supabase.from("ranks").select("id, name, level"),
        supabase.from("leave_entitlements").select("leave_type, year, days, grade").eq("leave_type", "annual"),
        supabase
          .from("leave_requests")
          .select("profile_id, type, start_date, end_date, status")
          .eq("type", "annual")
          .eq("status", "approved")
          .gte("start_date", `${year}-01-01`)
          .lte("start_date", `${year}-12-31`),
        supabase.from("holidays").select("date, recurring"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const holidays = (holidayRes.data ?? []) as HolidayDate[];
      const rankById = new Map((ranksRes.data ?? []).map((r) => [r.id, r]));
      const entitlements = entRes.data ?? [];
      const entitlementFor = (grade: string) => {
        const forYear = entitlements.filter((e) => e.year === year);
        const pool = forYear.length ? forYear : entitlements;
        const match =
          pool.find((e) => (e.grade ?? "").toLowerCase() === grade.toLowerCase()) ??
          pool.find((e) => !e.grade);
        if (match?.days != null) return Number(match.days);
        return grade === "senior" ? 36 : 28;
      };

      const takenByProfile = new Map<string, { days: number; lastEnd: string | null }>();
      for (const l of leaveRes.data ?? []) {
        const days = countLeaveDays(l.start_date, l.end_date, "annual", holidays);
        const prev = takenByProfile.get(l.profile_id) ?? { days: 0, lastEnd: null };
        takenByProfile.set(l.profile_id, {
          days: prev.days + days,
          lastEnd: !prev.lastEnd || l.end_date > prev.lastEnd ? l.end_date : prev.lastEnd,
        });
      }

      const rows: Row[] = (profilesRes.data ?? []).map((p) => {
        const rank = p.rank_id ? rankById.get(p.rank_id) : null;
        // Senior officers sit at the upper levels of the rank ladder.
        const grade = rank && (rank.level ?? 99) <= 8 ? "senior" : "junior";
        const entitlement = entitlementFor(grade);
        const taken = takenByProfile.get(p.id)?.days ?? 0;
        const remaining = Math.max(entitlement - taken, 0);
        let state: LeaveState = "on_track";
        if (remaining === 0) state = "taken";
        else if (month >= 10) state = "overdue";
        else if (month >= 6 && taken === 0) state = "due";
        return {
          id: p.id,
          staffId: p.staff_id,
          name: `${p.last_name}, ${p.first_name}`,
          grade,
          entitlement,
          taken,
          remaining,
          lastLeaveEnd: takenByProfile.get(p.id)?.lastEnd ?? null,
          state,
        };
      });
      return rows.sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
    },
  });

  const rows = data ?? [];
  const counts = useMemo(() => ({
    overdue: rows.filter((r) => r.state === "overdue").length,
    due: rows.filter((r) => r.state === "due").length,
    taken: rows.filter((r) => r.state === "taken").length,
  }), [rows]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.name} ${r.staffId}`.toLowerCase().includes(q)) return false;
    if (stateFilter === "all") return true;
    if (stateFilter === "attention") return r.state === "overdue" || r.state === "due";
    return r.state === stateFilter;
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Leave due &amp; overdue — {year}
          <Badge className={STATE_COLOR.overdue}>{counts.overdue} overdue</Badge>
          <Badge className={STATE_COLOR.due}>{counts.due} due</Badge>
          <Badge className={STATE_COLOR.taken}>{counts.taken} fully taken</Badge>
        </CardTitle>
        <CardDescription>
          Annual leave entitlement against leave actually taken, weekends and public
          holidays excluded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name or staff ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="attention">Needs attention</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due">Due</SelectItem>
              <SelectItem value="on_track">On track</SelectItem>
              <SelectItem value="taken">Fully taken</SelectItem>
              <SelectItem value="all">Everyone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nobody matches this view.
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.name} <span className="font-mono text-xs text-muted-foreground">{r.staffId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.grade === "senior" ? "Senior officer" : "Junior officer"} · {r.taken} of{" "}
                    {r.entitlement} days taken · {r.remaining} remaining
                    {r.lastLeaveEnd ? ` · last leave ended ${formatDate(r.lastLeaveEnd)}` : " · no leave taken yet"}
                  </p>
                </div>
                <Badge className={STATE_COLOR[r.state]}>{STATE_LABEL[r.state]}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LeaveDueWidget;
