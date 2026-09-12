import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isWeekend,
  startOfMonth,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isLeaveHoliday, type HolidayDate } from "@/lib/leave-days";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ApprovedLeaveRow {
  id: string;
  profile_id: string;
  type: string;
  start_date: string;
  end_date: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    staff_id: string | null;
  } | null;
}

const iso = (date: Date) => format(date, "yyyy-MM-dd");

const leaveLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/**
 * Compact, read-only dashboard calendar. Database policies keep the returned
 * officers inside the signed-in user's command scope.
 */
export function ApprovedLeaveCalendarWidget() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const monthStart = iso(month);
  const monthEnd = iso(endOfMonth(month));

  const { data: holidays = [] } = useQuery({
    queryKey: ["dashboard-leave-holidays", format(month, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("date, recurring");
      if (error) throw error;
      return (data ?? []) as HolidayDate[];
    },
  });

  const { data: leave = [], isLoading, isError } = useQuery({
    queryKey: ["dashboard-approved-leave", monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, profile_id, type, start_date, end_date, profiles!leave_requests_profile_id_fkey(first_name, last_name, staff_id)")
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ApprovedLeaveRow[];
    },
  });

  const workingDays = useMemo(
    () =>
      eachDayOfInterval({ start: month, end: endOfMonth(month) }).filter(
        (day) => !isWeekend(day) && !isLeaveHoliday(day, holidays),
      ),
    [holidays, month],
  );

  const rows = useMemo(() => {
    const grouped = new Map<string, { name: string; staffId: string | null; requests: ApprovedLeaveRow[] }>();
    for (const request of leave) {
      const current = grouped.get(request.profile_id);
      const name = `${request.profiles?.last_name ?? ""}, ${request.profiles?.first_name ?? ""}`
        .replace(/^,\s*|,\s*$/g, "") || "Officer";
      if (current) current.requests.push(request);
      else grouped.set(request.profile_id, { name, staffId: request.profiles?.staff_id ?? null, requests: [request] });
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [leave]);

  const requestOnDay = (requests: ApprovedLeaveRow[], day: Date) => {
    const value = iso(day);
    return requests.find((request) => request.start_date <= value && request.end_date >= value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          Approved leave · {format(month, "MMMM yyyy")}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" asChild><Link to="/leave/calendar">Full calendar</Link></Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading approved leave…</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">Approved leave could not be loaded.</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No approved leave in this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid border-b" style={{ gridTemplateColumns: `12rem repeat(${workingDays.length}, minmax(2rem, 1fr))` }}>
                <div className="p-2 text-xs font-semibold text-muted-foreground">Officer</div>
                {workingDays.map((day) => (
                  <div key={iso(day)} className="border-l p-1 text-center text-[10px] text-muted-foreground">
                    <span className="block font-semibold text-foreground">{format(day, "d")}</span>
                    {format(day, "EEEEE")}
                  </div>
                ))}
              </div>
              {rows.map((row) => (
                <div key={`${row.staffId ?? row.name}`} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: `12rem repeat(${workingDays.length}, minmax(2rem, 1fr))` }}>
                  <div className="min-w-0 p-2">
                    <p className="truncate text-xs font-medium">{row.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{row.staffId ?? "—"}</p>
                  </div>
                  {workingDays.map((day) => {
                    const request = requestOnDay(row.requests, day);
                    return (
                      <div key={iso(day)} className="flex min-h-10 items-center justify-center border-l p-0.5">
                        {request && (
                          <Badge className="h-7 w-full justify-center overflow-hidden px-1 text-[9px]" title={`${leaveLabel(request.type)} · ${request.start_date} to ${request.end_date}`}>
                            {leaveLabel(request.type)}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">Weekends and configured public holidays are omitted.</p>
      </CardContent>
    </Card>
  );
}