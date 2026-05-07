import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import NightGuardAssignmentsPanel from "./NightGuardAssignmentsPanel";
import { NightGuardOnlinePanel } from "./NightGuardOnlinePanel";
import { NightGuardDutySummary } from "./NightGuardDutySummary";
import { TodayRosterCard } from "./TodayRosterCard";
import NightGuardDutyUpload from "./NightGuardDutyUpload";
import { ManualAssignDialog } from "./ManualAssignDialog";
import { BulkStaffUploadDialog } from "@/components/staff/BulkStaffUploadDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Shield, ChevronLeft, ChevronRight, Users, Trash2, UserPlus } from "lucide-react";
import { format, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/export-menu";

interface Props {
  nightGuardStaff: any[];
  allStaff?: any[];
  shifts: any[];
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  isAdmin: boolean;
}

export default function NightGuardTab({ nightGuardStaff, allStaff = [], shifts, weekStart, setWeekStart, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const nightGuardShift = shifts.find((s: any) => s.name?.toLowerCase().includes("night guard"));

  // Cross-dashboard sync: any change to shift_assignments (Admin / Command / IPSE upload)
  // refreshes Night Guard views in real time so all roles see the same roster.
  useEffect(() => {
    const ch = supabase
      .channel("night-guard-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Fetch actual DB assignments for this week
  const { data: weekAssignments = [] } = useQuery({
    queryKey: ["night-guard-assignments", weekStart.toISOString()],
    queryFn: async () => {
      if (!nightGuardShift) return [];
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, profiles(id, first_name, last_name, staff_id, phone, email, gender)")
        .eq("shift_id", nightGuardShift.id)
        .gte("start_date", from)
        .lte("start_date", to);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!nightGuardShift,
  });

  // Get today's assigned guards from DB
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayAssignments = weekAssignments.filter((a: any) => a.start_date === todayStr);
  const todayDutyStaff = todayAssignments
    .map((a: any) => a.profiles)
    .filter(Boolean);

  // Delete all assignments for a specific day
  const deleteDayMutation = useMutation({
    mutationFn: async (date: string) => {
      if (!nightGuardShift) throw new Error("No shift");
      const { error } = await supabase
        .from("shift_assignments")
        .delete()
        .eq("shift_id", nightGuardShift.id)
        .eq("start_date", date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      toast.success("Assignments cleared for that day");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Export helpers
  const buildRows = () => {
    return weekDays.map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const dayAssignments = weekAssignments.filter((a: any) => a.start_date === dateStr);
      const names = dayAssignments
        .map((a: any) => a.profiles ? `${a.profiles.last_name}, ${a.profiles.first_name?.charAt(0)}.` : "—")
        .join("; ");
      return [format(d, "EEE dd MMM yyyy"), names || "—"];
    });
  };

  return (
    <div className="space-y-4">
      <TodayRosterCard
        todayDutyStaff={todayDutyStaff}
        totalStaff={nightGuardStaff.length}
        shiftStartTime={nightGuardShift?.start_time ?? null}
        shiftEndTime={nightGuardShift?.end_time ?? null}
      />
      <NightGuardDutySummary nightGuardStaff={nightGuardStaff} todayDutyStaff={todayDutyStaff} />
      <NightGuardOnlinePanel nightGuardStaff={nightGuardStaff} todayDutyStaff={todayDutyStaff} />
      {isAdmin && <NightGuardAssignmentsPanel nightGuardStaff={nightGuardStaff} allStaff={allStaff} shifts={shifts} />}

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] text-base font-bold">
                <Shield className="h-5 w-5 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] stroke-[2.5]" />
                Night Guard Duty Assignments — Week of {format(weekStart, "dd MMM yyyy")}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {nightGuardStaff.length} staff in Night Guard dept — manage duty via upload or manual assignment
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <>
                  <BulkStaffUploadDialog
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-semibold"
                        title="Bulk-upload Night Guard staff list (CSV/XLSX). Set department = 'Night Guard' in the file to register guards."
                      >
                        <UserPlus className="h-4 w-4" /> Upload Staff List
                      </Button>
                    }
                  />
                  <NightGuardDutyUpload nightGuardStaff={nightGuardStaff} shifts={shifts} />
                  <ManualAssignDialog nightGuardStaff={allStaff.length > 0 ? allStaff : nightGuardStaff} shifts={shifts} />
                </>
              )}
              <ExportMenu
                getData={() => ({
                  title: `Night Guard Duty — ${format(weekStart, "dd MMM yyyy")}`,
                  filename: `night_guard_${format(weekStart, "yyyy-MM-dd")}`,
                  headers: ["Date", "Assigned Guards"],
                  rows: buildRows(),
                })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const dateStr = format(d, "yyyy-MM-dd");
              const dayAssignments = weekAssignments.filter((a: any) => a.start_date === dateStr);
              const isToday = isSameDay(d, new Date());
              return (
                <Card key={d.toISOString()} className={isToday ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold ${isToday ? "text-[hsl(220,70%,25%)]" : "text-[hsl(220,50%,40%)]"}`}>
                        {format(d, "EEE dd")}
                      </span>
                      {isAdmin && dayAssignments.length > 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive opacity-0 group-hover:opacity-100">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Clear assignments for {format(d, "EEE dd MMM")}?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove all {dayAssignments.length} guard assignment(s) for this day.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDayMutation.mutate(dateStr)}>Clear</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    {dayAssignments.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">No guards assigned</p>
                    ) : (
                      <div className="space-y-1">
                        {dayAssignments.map((a: any) => (
                          <div key={a.id} className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-primary" />
                            <span className="text-[11px] truncate">
                              {a.profiles?.last_name}, {a.profiles?.first_name?.charAt(0)}.
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Badge variant="outline" className="text-[9px] mt-1">
                      {dayAssignments.length} guard{dayAssignments.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
