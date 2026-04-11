import { useState } from "react";
import { NightGuardOnlinePanel } from "./NightGuardOnlinePanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ChevronLeft, ChevronRight, Users, Plus, Download } from "lucide-react";
import { format, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Props {
  nightGuardStaff: any[];
  shifts: any[];
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  isAdmin: boolean;
}

export default function NightGuardTab({ nightGuardStaff, shifts, weekStart, setWeekStart, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Manual assignment state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualProfileId, setManualProfileId] = useState("");
  const [manualShiftId, setManualShiftId] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualEndDate, setManualEndDate] = useState("");

  const getNightGuardRotation = (day: Date) => {
    if (nightGuardStaff.length === 0) return [];
    const dayOfYear = Math.floor((day.getTime() - new Date(day.getFullYear(), 0, 0).getTime()) / 86400000);
    const perNight = Math.max(1, Math.ceil(nightGuardStaff.length / 7));
    const startIdx = (dayOfYear * perNight) % nightGuardStaff.length;
    const assigned = [];
    for (let i = 0; i < perNight; i++) {
      assigned.push(nightGuardStaff[(startIdx + i) % nightGuardStaff.length]);
    }
    return assigned;
  };

  const manualAssignMutation = useMutation({
    mutationFn: async () => {
      if (!manualProfileId || !manualShiftId || !manualDate) throw new Error("Fill all required fields");

      // Check for existing assignment on the same date
      const { data: existing } = await supabase
        .from("shift_assignments")
        .select("id")
        .eq("profile_id", manualProfileId)
        .eq("shift_id", manualShiftId)
        .eq("start_date", manualDate)
        .maybeSingle();

      if (existing) throw new Error("This guard is already assigned to this shift on the selected date");

      const { error } = await supabase.from("shift_assignments").insert({
        profile_id: manualProfileId,
        shift_id: manualShiftId,
        start_date: manualDate,
        end_date: manualEndDate || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Duplicate assignment: this guard is already assigned to this shift on the selected date");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setManualOpen(false);
      setManualProfileId("");
      setManualShiftId("");
      setManualDate("");
      setManualEndDate("");
      toast.success("Night guard manually assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Export helpers
  const buildRows = () => {
    return weekDays.map(d => {
      const rotation = getNightGuardRotation(d);
      return [format(d, "EEE dd MMM yyyy"), rotation.map((p: any) => `${p.last_name}, ${p.first_name?.charAt(0)}.`).join("; ") || "—"];
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Night Guard Rotation — ${format(weekStart, "dd MMM yyyy")}`, 14, 16);
    autoTable(doc, { head: [["Date", "Assigned Guards"]], body: buildRows(), startY: 22 });
    doc.save(`night_guard_${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  const exportCSV = () => {
    const rows = [["Date", "Assigned Guards"], ...buildRows()];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `night_guard_${format(weekStart, "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("CSV downloaded");
  };

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Date", "Assigned Guards"], ...buildRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Night Guard");
    XLSX.writeFile(wb, `night_guard_${format(weekStart, "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel downloaded");
  };

  return (
    <div className="space-y-4">
      <NightGuardOnlinePanel nightGuardStaff={nightGuardStaff} />
      <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-secondary text-base">
              <Shield className="h-5 w-5 text-primary" />
              Night Guard Duty Rotation — Week of {format(weekStart, "dd MMM yyyy")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {nightGuardStaff.length} staff in Night Guard Duty dept — auto-rotated nightly
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Dialog open={manualOpen} onOpenChange={setManualOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="h-4 w-4" /> Manual Assign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Manual Night Guard Assignment</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Guard</Label>
                      <Select value={manualProfileId} onValueChange={setManualProfileId}>
                        <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                        <SelectContent>
                          {nightGuardStaff.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.staff_id} — {p.last_name}, {p.first_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Shift</Label>
                      <Select value={manualShiftId} onValueChange={setManualShiftId}>
                        <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                        <SelectContent>
                          {shifts.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} ({s.pattern})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Start Date</Label>
                        <Input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                      </div>
                      <div>
                        <Label>End Date (optional)</Label>
                        <Input type="date" value={manualEndDate} onChange={e => setManualEndDate(e.target.value)} min={manualDate} />
                      </div>
                    </div>
                    <Button onClick={() => manualAssignMutation.mutate()} disabled={manualAssignMutation.isPending} className="w-full">
                      {manualAssignMutation.isPending ? "Assigning..." : "Assign Guard"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-4 w-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}>Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {nightGuardStaff.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground text-sm">
            No staff assigned to Night Guard Duty department
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const rotation = getNightGuardRotation(d);
              const isToday = isSameDay(d, new Date());
              return (
                <Card key={d.toISOString()} className={isToday ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className={`text-xs font-semibold mb-2 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {format(d, "EEE dd")}
                    </div>
                    <div className="space-y-1">
                      {rotation.map((p: any) => (
                        <div key={p.id} className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-primary" />
                          <span className="text-[11px] truncate">{p.last_name}, {p.first_name?.charAt(0)}.</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
