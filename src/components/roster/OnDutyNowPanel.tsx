/**
 * Live duty schedule — who is on duty right now.
 *
 * The on-duty group for the selected date comes from the shift-rotation
 * resolver (individual override → published schedule → default pattern), while
 * staff and their clock-in records come from the duty_roster_live RPC so
 * attendance rows stay behind a security-definer boundary.
 *
 * Reused by the Duty Roster page and the Command Console.
 */
import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, RefreshCw, Search, UserCheck, UserX, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShiftRotationConfig } from "@/hooks/useShiftRotationConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GROUP_COLORS, type ShiftGroup } from "@/lib/shift-rotation";

const db = supabase as any;

type LiveRow = {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  rank_abbr: string | null;
  rank_name: string | null;
  department_name: string | null;
  unit: string | null;
  shift_group: string | null;
  status: string | null;
  on_duty: boolean;
  check_in: string | null;
  check_out: string | null;
  attendance_status: string | null;
  org_unit_name: string | null;
};

function groupTone(group: string | null | undefined) {
  const key = String(group ?? "").toUpperCase() as ShiftGroup;
  return GROUP_COLORS[key] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", solid: "bg-muted" };
}

function timeOf(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "HH:mm");
}

export function OnDutyNowPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [dayOffset, setDayOffset] = useState(0);
  const [view, setView] = useState<"on-duty" | "present" | "missing" | "all">("on-duty");
  const [search, setSearch] = useState("");

  const day = useMemo(() => (dayOffset >= 0 ? addDays(new Date(), dayOffset) : subDays(new Date(), -dayOffset)), [dayOffset]);
  const iso = format(day, "yyyy-MM-dd");
  const { groupForDate, sourceForDate, isLoading: rotationLoading } = useShiftRotationConfig();
  const group = groupForDate(day);

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["duty-roster-live", iso, group],
    queryFn: async (): Promise<LiveRow[]> => {
      const { data, error } = await db.rpc("duty_roster_live", { _date: iso, _group: group });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 60_000,
  });

  // Clock-ins land in attendances — refresh the panel as they arrive.
  useEffect(() => {
    const channel = supabase
      .channel(`duty-live-${iso}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, () => {
        qc.invalidateQueries({ queryKey: ["duty-roster-live"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, iso]);

  const onDuty = useMemo(() => rows.filter((row) => row.on_duty), [rows]);
  const present = useMemo(() => onDuty.filter((row) => !!row.check_in), [onDuty]);
  const missing = useMemo(() => onDuty.filter((row) => !row.check_in), [onDuty]);
  const stillIn = useMemo(() => present.filter((row) => !row.check_out), [present]);

  const listed = useMemo(() => {
    const base = view === "on-duty" ? onDuty : view === "present" ? present : view === "missing" ? missing : rows;
    const term = search.trim().toLowerCase();
    const filtered = term
      ? base.filter((row) => [row.full_name, row.staff_id, row.unit, row.rank_name, row.department_name]
          .some((value) => String(value ?? "").toLowerCase().includes(term)))
      : base;
    return [...filtered].sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));
  }, [view, onDuty, present, missing, rows, search]);

  const tone = groupTone(group);
  const rotationSource = sourceForDate(day);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" /> Live duty schedule
            <Badge className={`${tone.bg} ${tone.text} ${tone.border} border`} variant="outline">Group {group}</Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(day, "EEEE, d MMMM yyyy")} · {rotationSource.label}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setDayOffset((v) => v - 1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setDayOffset(0)} disabled={dayOffset === 0}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setDayOffset((v) => v + 1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label="Refresh live duty schedule">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "On duty", value: onDuty.length, icon: Users },
            { label: "Clocked in", value: present.length, icon: UserCheck },
            { label: "On site now", value: stillIn.length, icon: Clock },
            { label: "Not clocked in", value: missing.length, icon: UserX },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border bg-muted/30 p-2.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><card.icon className="h-3.5 w-3.5" aria-hidden />{card.label}</p>
              <p className="text-xl font-semibold tabular-nums">{isLoading || rotationLoading ? "—" : card.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
            <TabsList className="h-9">
              <TabsTrigger value="on-duty" className="text-xs">On duty</TabsTrigger>
              <TabsTrigger value="present" className="text-xs">Clocked in</TabsTrigger>
              <TabsTrigger value="missing" className="text-xs">Missing</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">All shifts</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff on duty…" className="pl-8" aria-label="Search staff on duty" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Staff</th>
                <th className="py-2 pr-3">Shift</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Clock in</th>
                <th className="py-2 pr-3">Clock out</th>
                <th className="py-2">Bio-data</th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || rotationLoading) && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading the live schedule…</td></tr>
              )}
              {!isLoading && listed.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No staff in this view.</td></tr>
              )}
              {listed.slice(0, compact ? 25 : 200).map((row) => {
                const rowTone = groupTone(row.shift_group);
                return (
                  <tr key={row.profile_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="block font-medium">{[row.rank_abbr, row.full_name].filter(Boolean).join(" ") || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{row.staff_id ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={`${rowTone.bg} ${rowTone.text} ${rowTone.border} border`}>{row.shift_group ?? "—"}</Badge>
                    </td>
                    <td className="py-2 pr-3">{row.unit || row.department_name || row.org_unit_name || "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">{timeOf(row.check_in) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 pr-3 tabular-nums">{timeOf(row.check_out) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2">
                      <Link to={`/staff/${row.profile_id}`} className="font-medium text-primary underline-offset-4 hover:underline">Open record</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {listed.length > (compact ? 25 : 200) && (
          <p className="text-xs text-muted-foreground">Showing the first {compact ? 25 : 200} of {listed.length}.</p>
        )}
      </CardContent>
    </Card>
  );
}
