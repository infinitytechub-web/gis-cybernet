/**
 * Leave due / overdue overview.
 *
 * Reads the scoped `leave_due_overview` report: annual leave entitlement for
 * each officer's grade against the approved annual leave they have actually
 * taken this year (weekends and public holidays excluded). Administrators see
 * the whole service or a chosen command; commanders and supervisors only see
 * officers inside their own command and scope — the server decides, not the UI.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Download, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/date-format";
import { downloadCSVString } from "@/lib/download-utils";

export type LeaveState = "overdue" | "due" | "on_track" | "taken";

export const LEAVE_STATE_LABEL: Record<LeaveState, string> = {
  overdue: "Overdue",
  due: "Due",
  on_track: "On track",
  taken: "Fully taken",
};

export const LEAVE_STATE_COLOR: Record<LeaveState, string> = {
  overdue: "bg-red-100 text-red-800",
  due: "bg-amber-100 text-amber-800",
  on_track: "bg-sky-100 text-sky-800",
  taken: "bg-emerald-100 text-emerald-800",
};

const LEAVE_STATE_HINT: Record<LeaveState, string> = {
  overdue: "Has not used the full entitlement and the year is running out",
  due: "No annual leave taken by mid-year",
  on_track: "Leave in progress against the entitlement",
  taken: "Entitlement fully used",
};

type Row = {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  rank_name: string | null;
  unit_name: string | null;
  grade: string | null;
  entitlement: number | string | null;
  taken: number | string | null;
  remaining: number | string | null;
  last_leave_end: string | null;
  state: LeaveState;
};

const num = (v: number | string | null) => Number(v ?? 0);

export function LeaveDueWidget({ unitId = null }: { unitId?: string | null }) {
  const year = new Date().getFullYear();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("attention");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["leave-due-overview", year, unitId ?? "scope"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leave_due_overview", {
        _org_unit_id: unitId,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = data;
  const counts = useMemo(() => ({
    officers: rows.length,
    overdue: rows.filter((r) => r.state === "overdue").length,
    due: rows.filter((r) => r.state === "due").length,
    on_track: rows.filter((r) => r.state === "on_track").length,
    taken: rows.filter((r) => r.state === "taken").length,
    daysOutstanding: rows.reduce((sum, r) => sum + num(r.remaining), 0),
  }), [rows]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.full_name ?? ""} ${r.staff_id ?? ""}`.toLowerCase().includes(q)) return false;
    if (stateFilter === "all") return true;
    if (stateFilter === "attention") return r.state === "overdue" || r.state === "due";
    return r.state === stateFilter;
  });

  const exportCsv = () => {
    const header = [
      "Staff ID", "Officer", "Rank", "Command", "Grade",
      "Entitlement (days)", "Taken (days)", "Remaining (days)", "Last leave ended", "Status",
    ];
    const lines = [header, ...filtered.map((r) => [
      r.staff_id ?? "",
      r.full_name ?? "",
      r.rank_name ?? "",
      r.unit_name ?? "",
      r.grade ?? "",
      String(num(r.entitlement)),
      String(num(r.taken)),
      String(num(r.remaining)),
      r.last_leave_end ? formatDate(r.last_leave_end) : "",
      LEAVE_STATE_LABEL[r.state],
    ])];
    const csv = lines
      .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    downloadCSVString(csv, `leave-due-${year}.csv`);
  };

  const tiles: { state: LeaveState; value: number }[] = [
    { state: "overdue", value: counts.overdue },
    { state: "due", value: counts.due },
    { state: "on_track", value: counts.on_track },
    { state: "taken", value: counts.taken },
  ];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Leave due &amp; overdue — {year}
        </CardTitle>
        <CardDescription>
          Annual leave entitlement against leave actually taken, weekends and public
          holidays excluded. {counts.officers} officer(s) in view ·{" "}
          {counts.daysOutstanding} day(s) still owed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <button
              key={t.state}
              type="button"
              onClick={() => setStateFilter(t.state)}
              className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                stateFilter === t.state ? "border-primary" : ""
              }`}
              title={LEAVE_STATE_HINT[t.state]}
            >
              <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
              <Badge className={LEAVE_STATE_COLOR[t.state]}>{LEAVE_STATE_LABEL[t.state]}</Badge>
            </button>
          ))}
        </div>

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
          <Button variant="outline" size="sm" disabled={!filtered.length} onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Leave figures are not available for your account.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nobody matches this view.
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.map((r) => {
              const entitlement = num(r.entitlement);
              const taken = num(r.taken);
              const pct = entitlement > 0 ? Math.min((taken / entitlement) * 100, 100) : 0;
              return (
                <div key={r.profile_id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.rank_name ? `${r.rank_name} ` : ""}{r.full_name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">{r.staff_id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.grade === "senior" ? "Senior officer" : "Junior officer"}
                        {r.unit_name ? ` · ${r.unit_name}` : ""} · {taken} of {entitlement} days taken ·{" "}
                        {num(r.remaining)} remaining
                        {r.last_leave_end
                          ? ` · last leave ended ${formatDate(r.last_leave_end)}`
                          : " · no leave taken yet"}
                      </p>
                    </div>
                    <Badge className={LEAVE_STATE_COLOR[r.state]} title={LEAVE_STATE_HINT[r.state]}>
                      {LEAVE_STATE_LABEL[r.state]}
                    </Badge>
                  </div>
                  <Progress
                    value={pct}
                    aria-label={`${taken} of ${entitlement} days taken`}
                    className="h-1.5"
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LeaveDueWidget;
