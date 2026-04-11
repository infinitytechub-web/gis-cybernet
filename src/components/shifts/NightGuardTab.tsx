import { NightGuardOnlinePanel } from "./NightGuardOnlinePanel";
import { ManualAssignDialog } from "./ManualAssignDialog";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Shield, ChevronLeft, ChevronRight, Users, Download } from "lucide-react";
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
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <>
                  <ManualAssignDialog nightGuardStaff={nightGuardStaff} shifts={shifts} />
                  <BulkAssignDialog nightGuardStaff={nightGuardStaff} shifts={shifts} />
                </>
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
