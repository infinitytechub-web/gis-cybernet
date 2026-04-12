import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, ArrowUpDown, Download } from "lucide-react";
import { format, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Props {
  shifts: any[];
  assignments: any[];
  weekStart: Date;
  setWeekStart: (d: Date) => void;
}

export default function ShiftCalendarTab({ shifts, assignments, weekStart, setWeekStart }: Props) {
  const [sortField, setSortField] = useState<"name" | "pattern">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => {
      const av = (a[sortField] ?? "").toLowerCase();
      const bv = (b[sortField] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [shifts, sortField, sortDir]);

  const getAssignmentsForDay = (day: Date, shiftId: string) => {
    return assignments.filter((a: any) => {
      if (a.shift_id !== shiftId) return false;
      const start = new Date(a.start_date);
      const end = a.end_date ? new Date(a.end_date) : null;
      return day >= start && (!end || day <= end);
    });
  };

  const buildExportRows = () => {
    const rows: string[][] = [];
    for (const s of sortedShifts) {
      const row = [s.name, s.pattern];
      for (const d of weekDays) {
        const da = getAssignmentsForDay(d, s.id);
        row.push(da.map((a: any) => a.profiles?.last_name ?? "—").join(", ") || "—");
      }
      rows.push(row);
    }
    return rows;
  };

  const headers = ["Shift", "Pattern", ...weekDays.map(d => format(d, "EEE dd"))];

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Shift Schedule — ${format(weekStart, "dd MMM")} to ${format(addDays(weekStart, 6), "dd MMM yyyy")}`, 14, 16);
    autoTable(doc, { head: [headers], body: buildExportRows(), startY: 22, styles: { fontSize: 8 } });
    doc.save(`shifts_${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  const exportCSV = () => {
    const rows = [headers, ...buildExportRows()];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    downloadCSVString(csv, `shifts_${format(weekStart, "yyyy-MM-dd")}.csv`);
    toast.success("CSV downloaded");
  };

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...buildExportRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shifts");
    XLSX.writeFile(wb, `shifts_${format(weekStart, "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel downloaded");
  };

  const toggleSort = (field: "name" | "pattern") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(weekStart, "dd MMM")} – {format(addDays(weekStart, 6), "dd MMM yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={`${sortField}-${sortDir}`} onValueChange={(v) => { const [f, d] = v.split("-"); setSortField(f as any); setSortDir(d as any); }}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name ↑</SelectItem>
              <SelectItem value="name-desc">Name ↓</SelectItem>
              <SelectItem value="pattern-asc">Pattern ↑</SelectItem>
              <SelectItem value="pattern-desc">Pattern ↓</SelectItem>
            </SelectContent>
          </Select>

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

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px] cursor-pointer" onClick={() => toggleSort("name")}>
                <div className="flex items-center gap-1">Shift <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              {weekDays.map((d) => (
                <TableHead key={d.toISOString()} className={`text-center text-xs min-w-[90px] ${isSameDay(d, new Date()) ? "bg-primary/10" : ""}`}>
                  <div>{format(d, "EEE")}</div>
                  <div className="text-muted-foreground">{format(d, "dd")}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedShifts.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-xs">{s.name}</TableCell>
                {weekDays.map((d) => {
                  const dayAssignments = getAssignmentsForDay(d, s.id);
                  return (
                    <TableCell key={d.toISOString()} className={`text-center p-1 ${isSameDay(d, new Date()) ? "bg-primary/5" : ""}`}>
                      {dayAssignments.length > 0 ? (
                        <div className="space-y-0.5">
                          {dayAssignments.slice(0, 3).map((a: any) => (
                            <div key={a.id} className="text-[10px] bg-accent rounded px-1 py-0.5 truncate">
                              {a.profiles?.last_name}
                            </div>
                          ))}
                          {dayAssignments.length > 3 && (
                            <div className="text-[10px] text-muted-foreground">+{dayAssignments.length - 3}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
