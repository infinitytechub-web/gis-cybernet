import { useState, useMemo, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea as ScrollAreaCmd } from "@/components/ui/scroll-area";
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Users, Plus, X, Trash2, Search, Check, ChevronsUpDown,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createNotification, getUserIdFromProfileId } from "@/lib/notifications";
import { ExportMenu } from "@/components/ui/export-menu";
import { DateInput } from "@/components/ui/date-input";
import { OnDutyNowPanel } from "@/components/roster/OnDutyNowPanel";

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
  const { isAdminOrSupervisor } = useAuth();
  const isAdmin = isAdminOrSupervisor; // Admin, OIC, 2IC, Staff Officer, Supervisor can assign roster
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterShift, setFilterShift] = useState("all");
  const [filterDept, setFilterDept] = useState("all");

  // Quick-assign state
  const [assignDay, setAssignDay] = useState<string | null>(null);
  const [assignShiftId, setAssignShiftId] = useState("");
  const [assignProfileId, setAssignProfileId] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const staffListRef = useRef<HTMLDivElement>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDow = getDay(monthStart);
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

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, department_id")
        .eq("status", "active")
        .order("last_name");
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

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignShiftId || !assignProfileId || !assignDay) throw new Error("Select shift and staff");
      const { error } = await supabase.from("shift_assignments").insert({
        shift_id: assignShiftId,
        profile_id: assignProfileId,
        start_date: assignDay,
        end_date: assignEndDate || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["roster-assignments"] });
      const shift = shifts.find((s) => s.id === assignShiftId);
      const userId = await getUserIdFromProfileId(assignProfileId);
      if (userId) {
        await createNotification({
          userId,
          title: "New Shift Assignment",
          message: `You have been assigned to ${shift?.name ?? "a shift"} on ${assignDay}.`,
          type: "shift",
        });
      }
      setAssignDay(null);
      setAssignShiftId("");
      setAssignProfileId("");
      setAssignEndDate("");
      toast.success("Staff assigned to shift");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await softDelete({ table: "shift_assignments", id, label: "Shift assignment" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-assignments"] });
      toast.success("Assignment removed");
    },
    onError: (e: any) => toast.error(e.message),
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

  const buildRosterExportData = () => {
    const monthLabel = format(currentMonth, "MMMM yyyy");
    const dayHeaders = daysInMonth.map((d) => format(d, "dd EEE"));
    const headers = ["Shift", ...dayHeaders];
    const rows = shifts.map((s) => {
      const row = [s.name];
      daysInMonth.forEach((day) => {
        const dayAssigns = assignments.filter((a: any) => {
          if (a.shift_id !== s.id) return false;
          const start = new Date(a.start_date);
          const end = a.end_date ? new Date(a.end_date) : null;
          return day >= start && (!end || day <= end);
        });
        const names = dayAssigns.map((a: any) => `${a.profiles?.last_name || ""}`).join(", ");
        row.push(names || "—");
      });
      return row;
    });
    return {
      title: `Duty Roster — ${monthLabel}`,
      filename: `Duty_Roster_${format(currentMonth, "yyyy_MM")}`,
      headers,
      rows,
      subtitle: `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
    };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-secondary flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Duty Roster
          </h1>
          <p className="text-sm text-muted-foreground">
            Monthly shift schedule overview
            {isAdmin && " · Click a day to assign staff"}
          </p>
        </div>
        <ExportMenu getData={buildRosterExportData} />
      </div>

      {/* Controls */}
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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs justify-between w-[180px] gap-1">
              <span className="truncate">
                {filterShift === "all"
                  ? "All Shifts"
                  : shifts.find((s) => s.id === filterShift)?.name ?? "All Shifts"}
              </span>
              <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search shift..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>No shift found.</CommandEmpty>
                <CommandGroup>
                  <ScrollAreaCmd className="max-h-[260px]">
                    <CommandItem
                      value="all shifts"
                      onSelect={() => setFilterShift("all")}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3 w-3", filterShift === "all" ? "opacity-100" : "opacity-0")} />
                      All Shifts
                    </CommandItem>
                    {shifts.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`${s.name} ${s.pattern ?? ""} ${s.start_time ?? ""} ${s.end_time ?? ""}`}
                        onSelect={() => setFilterShift(s.id)}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3 w-3", filterShift === s.id ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : s.pattern}
                        </span>
                      </CommandItem>
                    ))}
                  </ScrollAreaCmd>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {filterShift !== "all" && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilterShift("all")}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}

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
          <div className="grid grid-cols-7 gap-px mb-1">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {Array.from({ length: paddingBefore }).map((_, i) => (
              <div key={`pad-${i}`} className="bg-muted/30 min-h-[80px] sm:min-h-[100px]" />
            ))}

            {daysInMonth.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayAssignments = getAssignmentsForDay(day);
              const holiday = getHoliday(day);
              const today = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const isAssignOpen = assignDay === dateStr;

              const cellContent = (
                <div
                  className={cn(
                    "bg-card min-h-[80px] sm:min-h-[100px] p-1 relative transition-colors group",
                    today && "ring-2 ring-primary ring-inset",
                    isWeekend && "bg-muted/20",
                    holiday && "bg-destructive/5",
                    isAdmin && "cursor-pointer hover:bg-accent/30"
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
                    <div className="flex items-center gap-0.5">
                      {dayAssignments.length > 0 && (
                        <span className="text-[9px] text-muted-foreground">{dayAssignments.length}</span>
                      )}
                      {isAdmin && (
                        <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
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

              if (!isAdmin) {
                return <div key={day.toISOString()}>{cellContent}</div>;
              }

              return (
                <Popover
                  key={day.toISOString()}
                  open={isAssignOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      setAssignDay(dateStr);
                      setAssignShiftId("");
                      setAssignProfileId("");
                      setAssignEndDate("");
                      setStaffSearch("");
                    } else {
                      setAssignDay(null);
                      setStaffSearch("");
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    {cellContent}
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" side="right" align="start">
                    <ScrollArea className="max-h-[360px] overflow-y-auto p-3">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">{format(day, "EEE, dd/MM/yyyy")}</h4>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAssignDay(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Existing assignments for this day */}
                      {dayAssignments.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Current assignments</Label>
                          {dayAssignments.map((a: any) => (
                            <div key={a.id} className="flex items-center justify-between text-xs bg-accent/50 rounded px-2 py-1">
                              <span>{a.profiles?.first_name} {a.profiles?.last_name} — {a.shifts?.name}</span>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-destructive hover:text-destructive"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Remove assignment?</AlertDialogTitle><AlertDialogDescription>This will remove {a.profiles?.first_name} {a.profiles?.last_name} from this shift. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeMutation.mutate(a.id)}>Remove</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-t pt-2 space-y-2">
                        <Label className="text-xs font-semibold">Quick Assign</Label>
                        <div>
                          <Label className="text-xs">Shift</Label>
                          <Select value={assignShiftId} onValueChange={setAssignShiftId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select shift" />
                            </SelectTrigger>
                            <SelectContent>
                              {shifts.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name} ({s.pattern})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Staff Member</Label>
                          {(() => {
                            const filteredProfiles = profiles.filter((p: any) => {
                              if (!staffSearch.trim()) return true;
                              const q = staffSearch.toLowerCase();
                              return (
                                p.staff_id?.toLowerCase().includes(q) ||
                                p.first_name?.toLowerCase().includes(q) ||
                                p.last_name?.toLowerCase().includes(q) ||
                                `${p.last_name}, ${p.first_name}`.toLowerCase().includes(q)
                              );
                            });
                            return (
                              <>
                                <div className="relative mt-1">
                                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                  <Input
                                    placeholder="Search staff..."
                                    value={staffSearch}
                                    onChange={(e) => { setStaffSearch(e.target.value); setHighlightIndex(0); }}
                                    className="h-8 text-xs pl-7"
                                    onKeyDown={(e) => {
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setHighlightIndex((prev) => Math.min(prev + 1, filteredProfiles.length - 1));
                                        staffListRef.current?.querySelector(`[data-idx="${Math.min(highlightIndex + 1, filteredProfiles.length - 1)}"]`)?.scrollIntoView({ block: "nearest" });
                                      } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setHighlightIndex((prev) => Math.max(prev - 1, 0));
                                        staffListRef.current?.querySelector(`[data-idx="${Math.max(highlightIndex - 1, 0)}"]`)?.scrollIntoView({ block: "nearest" });
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (highlightIndex >= 0 && highlightIndex < filteredProfiles.length) {
                                          setAssignProfileId(filteredProfiles[highlightIndex].id);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <ScrollArea className="max-h-[120px] mt-1 rounded-md border">
                                  <div className="p-1 space-y-0.5" ref={staffListRef}>
                                    {filteredProfiles.map((p: any, idx: number) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        data-idx={idx}
                                        onClick={() => setAssignProfileId(p.id)}
                                        className={cn(
                                          "w-full text-left text-xs rounded px-2 py-1 transition-colors",
                                          assignProfileId === p.id
                                            ? "bg-primary text-primary-foreground font-semibold"
                                            : highlightIndex === idx
                                            ? "bg-accent ring-2 ring-primary/40 font-medium"
                                            : "hover:bg-accent/50"
                                        )}
                                      >
                                        {p.staff_id} — {p.last_name}, {p.first_name}
                                      </button>
                                    ))}
                                    {filteredProfiles.length === 0 && (
                                      <p className="text-xs text-muted-foreground text-center py-2">No staff found</p>
                                    )}
                                  </div>
                                </ScrollArea>
                              </>
                            );
                          })()}
                        </div>
                        <div>
                          <Label className="text-xs">End Date (optional, for multi-day)</Label>
                          <DateInput  className="h-8 text-xs" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} min={dateStr} />
                        </div>
                        <Button
                          size="sm"
                          className="w-full gap-1"
                          disabled={!assignShiftId || !assignProfileId || assignMutation.isPending}
                          onClick={() => assignMutation.mutate()}
                        >
                          <Plus className="h-3 w-3" />
                          {assignMutation.isPending ? "Assigning..." : "Assign"}
                        </Button>
                      </div>
                    </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              );
            })}

            {Array.from({ length: (7 - ((paddingBefore + daysInMonth.length) % 7)) % 7 }).map((_, i) => (
              <div key={`pad-end-${i}`} className="bg-muted/30 min-h-[80px] sm:min-h-[100px]" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
