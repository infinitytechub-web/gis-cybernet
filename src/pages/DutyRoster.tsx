import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Users, Shield,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isToday, isSameMonth,
} from "date-fns";
import { cn } from "@/lib/utils";

const SHIFT_COLORS = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-secondary/15 text-secondary border-secondary/30",
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-teal-100 text-teal-800 border-teal-300",
];

export default function DutyRoster() {
  const { isAdmin } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterShift, setFilterShift] = useState("all");
  const [filterDept, setFilterDept] = useState("all");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start of month to align with Monday
  const startDow = getDay(monthStart); // 0=Sun
  const paddingBefore = startDow === 0 ? 6 : startDow - 1;

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shifts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["roster-assignments", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const from = format(monthStart, "yyyy-MM-dd");
      const to = format(monthEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, profiles(first_name, last_name, staff_id, department_id, shift_group), shifts(name, pattern, start_time, end_time)")
        .lte("start_date", to)
        .or(`end_date.gte.${from},end_date.is.null`);
      if (error) throw error;
      return data;
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays-month", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const from = format(monthStart, "yyyy-MM-dd");
      const to = format(monthEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("holidays")
        .select("name, date")
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return data;
    },
  });

  const shiftColorMap = new Map<string, string>();
  shifts.forEach((s, i) => {
    shiftColorMap.set(s.id, SHIFT_COLORS[i % SHIFT_COLORS.length]);
  });

  const getAssignmentsForDay = (day: Date) => {
    return assignments.filter((a: any) => {
      const start = new Date(a.start_date);
      const end = a.end_date ? new Date(a.end_date) : null;
      if (day < start || (end && day > end)) return false;
      if (filterShift !== "all" && a.shift_id !== filterShift) return false;
      if (filterDept !== "all" && a.profiles?.department_id !== filterDept) return false;
      return true;
    });
  };

  const getHoliday = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return holidays.find((h: any) => h.date === dateStr);
  };

  const totalAssigned = new Set(assignments.map((a: any) => a.profile_id)).size;
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-secondary flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Duty Roster
          </h1>
          <p className="text-sm text-muted-foreground">Monthly shift schedule overview</p>
        </div>
      </div>

      {/* Stats + Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-8 px-3 font-semibold text-sm min-w-[160px]" onClick={() => setCurrentMonth(new Date())}>
            {format(currentMonth, "MMMM yyyy")}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={filterShift} onValueChange={setFilterShift}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="All shifts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shifts</SelectItem>
            {shifts.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="All depts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{totalAssigned} assigned</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{shifts.length} shifts</span>
        </div>
      </div>

      {/* Shift Legend */}
      <div className="flex flex-wrap gap-2">
        {shifts.map((s, i) => (
          <Badge key={s.id} variant="outline" className={cn("text-[10px] border", SHIFT_COLORS[i % SHIFT_COLORS.length])}>
            {s.name} {s.start_time && s.end_time ? `(${s.start_time}–${s.end_time})` : `(${s.pattern})`}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
          Holiday
        </Badge>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {/* Padding cells */}
            {Array.from({ length: paddingBefore }).map((_, i) => (
              <div key={`pad-${i}`} className="bg-muted/30 min-h-[80px] sm:min-h-[100px]" />
            ))}

            {daysInMonth.map((day) => {
              const dayAssignments = getAssignmentsForDay(day);
              const holiday = getHoliday(day);
              const today = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "bg-card min-h-[80px] sm:min-h-[100px] p-1 relative transition-colors",
                    today && "ring-2 ring-primary ring-inset",
                    isWeekend && "bg-muted/20",
                    holiday && "bg-destructive/5"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      "text-xs font-medium",
                      today && "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center",
                      !today && isWeekend && "text-muted-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                    {dayAssignments.length > 0 && (
                      <span className="text-[9px] text-muted-foreground">{dayAssignments.length}</span>
                    )}
                  </div>

                  {holiday && (
                    <div className="text-[9px] text-destructive font-medium truncate mb-0.5" title={holiday.name}>
                      {holiday.name}
                    </div>
                  )}

                  <div className="space-y-px overflow-hidden">
                    {dayAssignments.slice(0, 3).map((a: any) => {
                      const colorClass = shiftColorMap.get(a.shift_id) || SHIFT_COLORS[0];
                      return (
                        <Tooltip key={a.id}>
                          <TooltipTrigger asChild>
                            <div className={cn("text-[9px] sm:text-[10px] rounded px-1 py-px truncate border cursor-default", colorClass)}>
                              <span className="hidden sm:inline">{a.profiles?.last_name}, </span>
                              <span className="sm:hidden">{a.profiles?.last_name?.slice(0, 6)}</span>
                              <span className="hidden sm:inline">{a.profiles?.first_name?.[0]}.</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-semibold">{a.profiles?.first_name} {a.profiles?.last_name}</p>
                            <p className="text-muted-foreground">{a.shifts?.name} · {a.shifts?.start_time || a.shifts?.pattern}</p>
                            <p className="text-muted-foreground">ID: {a.profiles?.staff_id}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {dayAssignments.length > 3 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-[9px] text-muted-foreground text-center cursor-default">
                            +{dayAssignments.length - 3} more
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[200px]">
                          {dayAssignments.slice(3).map((a: any) => (
                            <p key={a.id}>{a.profiles?.first_name} {a.profiles?.last_name} — {a.shifts?.name}</p>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Padding after */}
            {Array.from({ length: (7 - ((paddingBefore + daysInMonth.length) % 7)) % 7 }).map((_, i) => (
              <div key={`pad-end-${i}`} className="bg-muted/30 min-h-[80px] sm:min-h-[100px]" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
